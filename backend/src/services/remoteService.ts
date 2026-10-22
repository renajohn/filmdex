import type { Response } from 'express';
import { getDatabase } from '../database';

/**
 * A remote for the music playing in a browser: each player tells what it
 * plays, and listens for the commands another device (an iPhone) sends it.
 * What plays is kept in memory, nothing worth keeping; the names given to
 * computers are kept in remote_players.
 */

export interface RemoteState {
  /** The device, as its player names it: MacBook · Chrome. */
  name: string;
  playing: boolean;
  album: { id: number | null; title: string; artist: string; cover: string | null } | null;
  track: { title: string; disc: number; no: number } | null;
  index: number;
  count: number;
  position: number;
  duration: number;
  /** What went wrong there, said to the remote: needs a click (the browser would not play unasked). */
  error: string | null;
}

export type RemoteCommand =
  | { action: 'toggle' | 'next' | 'previous' | 'listenNext' }
  | { action: 'playAlbum'; albumId: number; index?: number; disc?: number };

interface Player {
  id: string;
  state: RemoteState;
  /** Last heard of: a report, or its connection opened. */
  seenAt: number;
  /** Last told what it plays: its place in the track counts from then. */
  reportedAt: number;
  /** Its connections, the newest last: commands go to that one alone, a page reloaded leaving the old one a moment. */
  listeners: Response[];
  startedAt: number;
}

/** A player not heard of for this long is gone: its tab closed. */
const GONE_AFTER_MS = 30_000;
/**
 * A player listening but silent this long is asleep: its computer slept
 * without closing its connection, which the server learns of only minutes
 * later. A page tells what it plays every 30 s even paused; a hidden tab's
 * timers may wait a minute.
 */
const ASLEEP_AFTER_MS = 120_000;
/**
 * Its connection is kept open by a word now and then, proxies closing quiet
 * ones; and the page, hearing none for a while, knows its connection dead
 * though open (a proxy keeps it so when the server behind restarts).
 */
const KEEP_ALIVE_MS = 20_000;
/** A command not acknowledged by then went nowhere. */
const ACK_WITHIN_MS = 2_500;
/** Players kept at most; a browser is an id in its localStorage, a private window another. */
const MAX_PLAYERS = 50;
/** A player not heard of for an hour, with no connection, is forgotten. */
const FORGET_AFTER_MS = 3_600_000;

/** An id as a browser makes one. */
export const validId = (id: string): boolean => /^[a-z0-9]{1,32}$/i.test(id);

const players = new Map<string, Player>();

const prune = (now = Date.now()): void => {
  for (const [id, player] of players) {
    if (player.listeners.length === 0 && now - player.seenAt > FORGET_AFTER_MS) players.delete(id);
  }
  if (players.size < MAX_PLAYERS) return;
  const quiet = [...players.values()].filter(p => p.listeners.length === 0).sort((a, b) => a.seenAt - b.seenAt);
  for (const player of quiet.slice(0, players.size - MAX_PLAYERS + 1)) players.delete(player.id);
};

const playerOf = (id: string): Player | null => {
  let player = players.get(id);
  if (!player) {
    prune();
    if (players.size >= MAX_PLAYERS) return null;
    player = {
      id, state: { name: 'A browser', playing: false, album: null, track: null, index: 0, count: 0, position: 0, duration: 0, error: null },
      seenAt: 0, reportedAt: 0, listeners: [], startedAt: 0,
    };
    players.set(id, player);
  }
  return player;
};

/** What a player plays now: false when there are too many players to keep another. */
const report = (id: string, state: RemoteState): boolean => {
  const player = playerOf(id);
  if (!player) return false;
  // When it started what it plays: of two computers playing, the remote speaks to the last one started.
  if (state.playing && (!player.state.playing || player.state.album?.id !== state.album?.id || player.state.album?.title !== state.album?.title)) player.startedAt = Date.now();
  player.state = state;
  player.seenAt = player.reportedAt = Date.now();
  return true;
};

// The names given to computers from the remote (MacBook du salon), kept: a browser cannot tell its machine's.
// Read each time, a few rows: a backup restored brings its own.
const run = (sql: string, params: unknown[] = []) => new Promise<void>((resolve, reject) =>
  getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));
const namesOf = (): Promise<Map<string, string>> => new Promise((resolve, reject) =>
  getDatabase().all('SELECT id, name FROM remote_players', (err: Error | null, rows: Array<{ id: string; name: string }>) =>
    (err ? reject(err) : resolve(new Map((rows || []).map(row => [row.id, row.name]))))));

/** A computer named, or its name taken back to its browser's (empty): false when no such player is there. */
const rename = async (id: string, name: string): Promise<boolean> => {
  if (!players.has(id)) return false;
  const clean = name.trim().slice(0, 40);
  if (clean) await run('INSERT INTO remote_players (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name', [id, clean]);
  else await run('DELETE FROM remote_players WHERE id = ?', [id]);
  return true;
};

export type RemoteListed = RemoteState & { id: string; online: boolean; seenAt: number; startedAt: number; age: number };

/**
 * The players heard of lately, or listening for commands, the last heard
 * first, by the names they were given; `age`, how long ago they told what
 * they play, the place in a track counting from then whatever the clocks.
 */
const list = async (now = Date.now()): Promise<RemoteListed[]> => {
  const known = await namesOf();
  return [...players.values()]
    .filter(player => player.listeners.length > 0 || now - player.seenAt < GONE_AFTER_MS)
    .sort((a, b) => b.seenAt - a.seenAt)
    .map(player => ({
      id: player.id, ...player.state, name: known.get(player.id) || player.state.name,
      online: player.listeners.length > 0 && now - player.seenAt < ASLEEP_AFTER_MS,
      seenAt: player.seenAt, startedAt: player.startedAt, age: player.reportedAt ? now - player.reportedAt : 0,
    }));
};

// Commands waiting for their player to say it has them.
const waiting = new Map<string, () => void>();
let nextCommand = 0;

/**
 * A command sent to a player, resolved when it says it has it: 'sent', or
 * 'deaf' when it does not listen, 'silent' when it does not answer (asleep).
 */
const send = (id: string, command: RemoteCommand): Promise<'sent' | 'deaf' | 'silent'> => {
  const player = players.get(id);
  const listener = player?.listeners[player.listeners.length - 1];
  if (!listener) return Promise.resolve('deaf');
  const commandId = `${Date.now().toString(36)}${(nextCommand++).toString(36)}`;
  return new Promise(resolve => {
    const timer = setTimeout(() => { waiting.delete(commandId); resolve('silent'); }, ACK_WITHIN_MS);
    waiting.set(commandId, () => { clearTimeout(timer); waiting.delete(commandId); resolve('sent'); });
    listener.write(`data: ${JSON.stringify({ ...command, id: commandId })}\n\n`);
  });
};

/** A player saying it has a command. */
const acknowledge = (commandId: string): boolean => {
  const done = waiting.get(commandId);
  done?.();
  return Boolean(done);
};

/** A player listening for its commands, as Server-Sent Events, until its connection closes; null when there are too many. */
const listen = (id: string, response: Response): (() => void) | null => {
  const player = playerOf(id);
  if (!player) return null;
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  response.write(': listening\n\n');
  player.listeners.push(response);
  player.seenAt = Date.now();
  const alive = setInterval(() => response.write('event: alive\ndata: 1\n\n'), KEEP_ALIVE_MS);
  return () => {
    clearInterval(alive);
    player.listeners = player.listeners.filter(listener => listener !== response);
  };
};

/** For the tests: no player. */
export const forgetPlayers = (): void => { players.clear(); waiting.clear(); };

export default { report, list, send, listen, rename, acknowledge };
