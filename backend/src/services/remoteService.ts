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
}

export type RemoteCommand =
  | { action: 'toggle' | 'next' | 'previous' | 'listenNext' }
  | { action: 'playAlbum'; albumId: number; index?: number; disc?: number };

interface Player { id: string; state: RemoteState; seenAt: number; listeners: Set<Response>; startedAt: number }

/** A player not heard of for this long is gone: its tab closed, its computer asleep. */
const GONE_AFTER_MS = 30_000;
/** Its connection is kept open by a word now and then, proxies closing quiet ones. */
const KEEP_ALIVE_MS = 20_000;

const players = new Map<string, Player>();

const playerOf = (id: string): Player => {
  let player = players.get(id);
  if (!player) {
    player = { id, state: { name: 'A browser', playing: false, album: null, track: null, index: 0, count: 0, position: 0, duration: 0 }, seenAt: 0, listeners: new Set(), startedAt: 0 };
    players.set(id, player);
  }
  return player;
};

/** What a player plays now. */
const report = (id: string, state: RemoteState): void => {
  const player = playerOf(id);
  // When it started what it plays: of two computers playing, the remote speaks to the last one started.
  if (state.playing && (!player.state.playing || player.state.album?.id !== state.album?.id || player.state.album?.title !== state.album?.title)) player.startedAt = Date.now();
  player.state = state;
  player.seenAt = Date.now();
};

// The names given to computers from the remote (MacBook du salon), kept: a browser cannot tell its machine's.
const run = (sql: string, params: unknown[] = []) => new Promise<void>((resolve, reject) =>
  getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));
let names: Map<string, string> | null = null;
const namesOf = async (): Promise<Map<string, string>> => {
  if (names) return names;
  await run('CREATE TABLE IF NOT EXISTS remote_players (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
  const rows = await new Promise<Array<{ id: string; name: string }>>((resolve, reject) =>
    getDatabase().all('SELECT id, name FROM remote_players', (err: Error | null, found: Array<{ id: string; name: string }>) => (err ? reject(err) : resolve(found || []))));
  names = new Map(rows.map(row => [row.id, row.name]));
  return names;
};

/** A computer named, or its name taken back to its browser's (empty). */
const rename = async (id: string, name: string): Promise<void> => {
  const known = await namesOf();
  const clean = name.trim().slice(0, 40);
  if (clean) { await run('INSERT INTO remote_players (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name', [id, clean]); known.set(id, clean); }
  else { await run('DELETE FROM remote_players WHERE id = ?', [id]); known.delete(id); }
};

/** The players heard of lately, or listening for commands, the last heard first, by the names they were given. */
const list = async (now = Date.now()): Promise<Array<RemoteState & { id: string; online: boolean; seenAt: number; startedAt: number }>> => {
  const known = await namesOf();
  return [...players.values()]
    .filter(player => player.listeners.size > 0 || now - player.seenAt < GONE_AFTER_MS)
    .sort((a, b) => b.seenAt - a.seenAt)
    .map(player => ({ id: player.id, ...player.state, name: known.get(player.id) || player.state.name, online: player.listeners.size > 0, seenAt: player.seenAt, startedAt: player.startedAt }));
};

/** A command sent to a player: false when it does not listen. */
const send = (id: string, command: RemoteCommand): boolean => {
  const player = players.get(id);
  if (!player || player.listeners.size === 0) return false;
  for (const listener of player.listeners) listener.write(`data: ${JSON.stringify(command)}\n\n`);
  return true;
};

/** A player listening for its commands, as Server-Sent Events, until its connection closes. */
const listen = (id: string, response: Response): (() => void) => {
  const player = playerOf(id);
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  response.write(': listening\n\n');
  player.listeners.add(response);
  player.seenAt = Date.now();
  const alive = setInterval(() => response.write(': alive\n\n'), KEEP_ALIVE_MS);
  return () => {
    clearInterval(alive);
    player.listeners.delete(response);
  };
};

/** For the tests: no player. */
export const forgetPlayers = (): void => { players.clear(); names = null; };

export default { report, list, send, listen, rename };
