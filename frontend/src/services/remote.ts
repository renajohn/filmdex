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
}

export type RemoteCommand =
  | { action: 'toggle' | 'next' | 'previous' | 'listenNext' }
  | { action: 'playAlbum'; albumId: number; index?: number; disc?: number };

const ID_KEY = 'dv.remote.device';

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

/** A computer, with a pointer: the one that plays and is told what to; a phone is the remote. */
export const isComputer = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const remote = {
  players: (): Promise<RemotePlayer[]> => fetch('/api/remote/players').then(r => (r.ok ? r.json() : [])),
  report: (state: Omit<RemotePlayer, 'id' | 'online' | 'seenAt' | 'startedAt'>): Promise<unknown> =>
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
  /** A computer's commands, as they come, until stopped. */
  listen: (onCommand: (command: RemoteCommand) => void): (() => void) => {
    if (typeof EventSource === 'undefined') return () => undefined;
    const source = new EventSource(`/api/remote/players/${deviceId()}/commands`);
    source.onmessage = event => { try { onCommand(JSON.parse(event.data) as RemoteCommand); } catch { /* not a command */ } };
    return () => source.close();
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

/**
 * The other players, the computers above all, asked again every few seconds
 * while the page is in sight: what plays where, and where an album can be sent.
 */
export const useRemotePlayers = (every = 3000): RemotePlayer[] => {
  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  useEffect(() => {
    let live = true;
    const me = deviceId();
    const ask = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      remote.players().then(list => { if (live) setPlayers(list.filter(p => p.id !== me)); }).catch(() => undefined);
    };
    ask();
    const timer = window.setInterval(ask, every);
    document.addEventListener('visibilitychange', ask);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', ask); };
  }, [every]);
  return players;
};

export default remote;
