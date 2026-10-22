import { useEffect, useState } from 'react';
import { readStored, writeStored } from '../utils/safeStorage';

/**
 * The remote: a computer's browser tells the server what it plays and takes
 * commands from it; an iPhone sees what plays there and sends them.
 */

export interface RemotePlayer {
  id: string;
  name: string;
  playing: boolean;
  online: boolean;
  album: { id: number | null; title: string; artist: string; cover: string | null } | null;
  track: { title: string; disc: number; no: number } | null;
  index: number;
  count: number;
  position: number;
  duration: number;
  seenAt: number;
  /** When it started what it plays. */
  startedAt: number;
  /** What went wrong there: needs a click (the browser would not play unasked). */
  error: string | null;
  /** When it told what it plays, by this device's clock: its place in the track counts from then. */
  reportedAt: number;
}

/** What a computer tells of itself; the server adds the rest. */
export type RemoteReport = Omit<RemotePlayer, 'id' | 'online' | 'seenAt' | 'startedAt' | 'reportedAt'>;

export type RemoteCommand =
  | { action: 'toggle' | 'next' | 'previous' | 'listenNext' }
  | { action: 'playAlbum'; albumId: number; index?: number; disc?: number };

const ID_KEY = 'dv.remote.device';
/** The server says its connection is alive every 20 s; with no word of it this long, it is dead. */
const SILENT_AFTER_MS = 45_000;

/** This browser, the same from one visit to the next. */
export const deviceId = (): string => {
  let id = readStored(ID_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    writeStored(ID_KEY, id);
  }
  return id;
};

/** What a person calls this browser: Mac · Chrome. */
export const deviceName = (agent = typeof navigator === 'undefined' ? '' : navigator.userAgent): string => {
  const system = /iPhone/.test(agent) ? 'iPhone' : /iPad/.test(agent) ? 'iPad' : /Macintosh|Mac OS X/.test(agent) ? 'Mac'
    : /Windows/.test(agent) ? 'PC' : /Android/.test(agent) ? 'Android' : /Linux/.test(agent) ? 'Linux' : 'Browser';
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : '';
  return browser ? `${system} · ${browser}` : system;
};

export { isComputer } from '../utils/isComputer';

const remote = {
  /** The players, their place in a track dated by this device's clock (the server says how long ago). */
  players: async (): Promise<RemotePlayer[]> => {
    const response = await fetch('/api/remote/players');
    if (!response.ok) return [];
    const now = Date.now();
    return ((await response.json()) as Array<RemotePlayer & { age?: number }>).map(({ age, ...p }) => ({ ...p, reportedAt: now - (age || 0) }));
  },
  report: (state: RemoteReport): Promise<unknown> =>
    fetch(`/api/remote/players/${deviceId()}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }),
  send: async (playerId: string, command: RemoteCommand): Promise<void> => {
    const response = await fetch(`/api/remote/players/${playerId}/commands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
    });
    if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || 'The command did not go through');
  },
  /** A computer named as one knows it: MacBook du salon; empty, its browser's name again. */
  rename: async (playerId: string, name: string): Promise<void> => {
    const response = await fetch(`/api/remote/players/${playerId}/name`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (!response.ok) throw new Error('The name was not kept');
  },
  /**
   * A computer's commands, as they come, each said received at once, until
   * stopped; `onOpen` each time its connection opens, to tell what it plays
   * to a server that may have restarted. A browser opens a connection lost
   * again by itself, but not one refused (the server restarting, a proxy's
   * 502): that one is opened again here, a little later each time. Nor one
   * a proxy keeps open with nothing behind: the server says it is there
   * every 20 s, and with no word of it for 45 s the connection is opened again.
   */
  listen: (onCommand: (command: RemoteCommand) => void, onOpen: () => void = () => undefined): (() => void) => {
    if (typeof EventSource === 'undefined') return () => undefined;
    let source: EventSource | null = null;
    let retry = 0;
    let timer: number | undefined;
    let stopped = false;
    let heard = Date.now();
    const open = () => {
      heard = Date.now();
      source = new EventSource(`/api/remote/players/${deviceId()}/commands`);
      source.onopen = () => { retry = 0; heard = Date.now(); onOpen(); };
      source.addEventListener('alive', () => { heard = Date.now(); });
      source.onmessage = event => {
        heard = Date.now();
        let command: RemoteCommand & { id?: string };
        try { command = JSON.parse(event.data); } catch { return; }
        if (command.id) void fetch(`/api/remote/acks/${command.id}`, { method: 'POST' }).catch(() => undefined);
        const { id: _id, ...rest } = command;
        onCommand(rest as RemoteCommand);
      };
      source.onerror = () => {
        if (stopped || source?.readyState !== 2) return;
        timer = window.setTimeout(open, Math.min(30_000, 1000 * 2 ** retry++));
      };
    };
    open();
    const watch = window.setInterval(() => {
      if (source?.readyState === 1 && Date.now() - heard > SILENT_AFTER_MS) { source.close(); open(); }
    }, 5_000);
    return () => { stopped = true; window.clearTimeout(timer); window.clearInterval(watch); source?.close(); };
  },
};

const TARGET_KEY = 'dv.remote.target';
/** The computer this phone chose to speak to, kept while it is there. */
export const chosenTarget = (): string | null => readStored(TARGET_KEY);
export const chooseTarget = (id: string | null): void => writeStored(TARGET_KEY, id || '');

/**
 * The computer a remote speaks to: the one chosen while it is there; else, of
 * those playing, the last started (not the last heard, which changes every
 * few seconds); else the first one listening.
 */
export const targetOf = (players: RemotePlayer[], chosen: string | null = null): RemotePlayer | null =>
  players.find(p => p.id === chosen && p.online)
  || [...players].filter(p => p.playing).sort((a, b) => b.startedAt - a.startedAt)[0]
  || players.find(p => p.online)
  || null;

/** Asked every few seconds while a computer plays; now and then otherwise, the phone's battery kept. */
const EVERY_PLAYING_MS = 3_000;
const EVERY_QUIET_MS = 20_000;

// One asking for all who want the players (the remote's bar, an album's card), while any does.
let known: RemotePlayer[] = [];
const watchers = new Set<(players: RemotePlayer[]) => void>();
let timer: number | undefined;

const schedule = () => {
  window.clearTimeout(timer);
  if (watchers.size === 0) return;
  timer = window.setTimeout(refreshPlayers, known.some(p => p.online && p.playing) ? EVERY_PLAYING_MS : EVERY_QUIET_MS);
};

/** For the tests: no player known. */
export const forgetRemotePlayers = (): void => { known = []; };

/** The players asked again now, and soon after a command: what it did shows at once. */
export const refreshPlayers = (): void => {
  window.clearTimeout(timer);
  if (watchers.size === 0) return;
  if (typeof document !== 'undefined' && document.hidden) { schedule(); return; }
  const me = deviceId();
  remote.players()
    .then(list => { known = list.filter(p => p.id !== me); watchers.forEach(watcher => watcher(known)); })
    .catch(() => undefined)
    .finally(schedule);
};

const onVisible = () => { if (!document.hidden) refreshPlayers(); };

/**
 * The other players, the computers above all, asked again while the page is
 * in sight: what plays where, and where an album can be sent.
 */
export const useRemotePlayers = (): RemotePlayer[] => {
  const [players, setPlayers] = useState<RemotePlayer[]>(known);
  useEffect(() => {
    watchers.add(setPlayers);
    if (watchers.size === 1) { document.addEventListener('visibilitychange', onVisible); refreshPlayers(); }
    return () => {
      watchers.delete(setPlayers);
      if (watchers.size === 0) { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); }
    };
  }, []);
  return players;
};

export default remote;
