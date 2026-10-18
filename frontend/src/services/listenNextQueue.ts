import musicService from './musicService';
import { LISTEN_NEXT_LEFT_EVENT, player, registerQueue, type PlayOptions } from './player';
import { playAlbumById } from '../utils/playAlbum';
import { readStored, writeStored } from '../utils/safeStorage';

/**
 * Listen Next played on the computer, album after album. The list is read
 * again at the end of each album, so what is added, taken out or moved since
 * counts: the next album is the one after the album playing in the list as it
 * now is, the first one after the last. An album played to its end leaves the
 * list on the server, by its scrobble, unless Repeat is on; so does one
 * skipped with ⏭ on its last track, heard or not.
 *
 * With Repeat off, the play stops when nothing is left, or when it comes back
 * to an album played in this play.
 *
 * The tracks' dialog jumps to a track of the list, or to one of an album
 * that left it in this play: a detour, played to its end out of the list,
 * after which Listen Next goes back where it was.
 */

/** The list as last read, the album playing kept at its place even once out of it. */
let order: number[] = [];
/** The list as last read, as it is; null until read after a reload. */
let listed: number[] | null = null;
let currentId: number | null = null;
let repeat = false;
const played = new Set<number>();
/** Albums that left the list once played, as the server said: not taken out by hand. */
const departed = new Set<number>();

/** Where Listen Next goes back to once a detour is over: the album and the track it was left on. */
export interface DetourBack {
  albumId: number;
  index: number;
}

/**
 * The play of Listen Next since its ▶, kept in the browser for a reload: the
 * albums played in turn, those of which a track was counted as played, and
 * the detour under way.
 */
export interface ListenNextSession {
  /** Unix seconds. */
  startedAt: number;
  albums: number[];
  heard: number[];
  detour: { albumId: number; back: DetourBack } | null;
}

const SESSION_KEY = 'dexvault.listenNext.session';

const emptySession = (): ListenNextSession => ({ startedAt: 0, albums: [], heard: [], detour: null });

const readSession = (): ListenNextSession => {
  try {
    const raw = readStored(SESSION_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && Array.isArray(value.albums) && Array.isArray(value.heard) ? { ...emptySession(), ...value } : emptySession();
  } catch {
    return emptySession();
  }
};

const noteSession = (change: (session: ListenNextSession) => void): void => {
  const session = readSession();
  change(session);
  writeStored(SESSION_KEY, JSON.stringify(session));
};

const noteHeard = (id: number) => noteSession(session => {
  if (!session.heard.includes(id)) session.heard.push(id);
});

/**
 * The albums the tracks' dialog shows: those of this play that left the list
 * and were heard, at least a track of them (one taken out by hand unheard was
 * not wanted), or the one playing; then the list as it is.
 */
export const sessionAlbums = (session: ListenNextSession, ids: number[], current: number | null): { gone: number[]; listed: number[] } => ({
  gone: session.albums.filter(id => !ids.includes(id) && (session.heard.includes(id) || id === current)),
  listed: ids,
});

const listIds = async (): Promise<number[]> =>
  ((await musicService.getListenNextAlbums()) as Array<{ id: number }>).map(album => album.id);

/**
 * The list as it now is, with the album playing kept at its place when it
 * has left it: after the album that came before it, among those still there.
 */
export const withCurrent = (ids: number[], previous: number[], current: number | null): number[] => {
  if (current == null || ids.includes(current)) return ids;
  const at = previous.indexOf(current);
  const before = at < 0 ? [] : previous.slice(0, at).filter(id => ids.includes(id));
  const place = before.length === 0 ? 0 : ids.indexOf(before[before.length - 1]) + 1;
  return [...ids.slice(0, place), current, ...ids.slice(place)];
};

/** The albums to try after `current`, in turn: those after it, then from the top; with Repeat, itself last. */
export const albumsAfter = (ids: number[], current: number | null, withRepeat: boolean): number[] => {
  const at = current == null ? -1 : ids.indexOf(current);
  const turn = at < 0 ? ids : [...ids.slice(at + 1), ...ids.slice(0, at)];
  return withRepeat && current != null && at >= 0 ? [...turn, current] : turn;
};

const playFrom = async (candidates: number[]): Promise<boolean> => {
  for (const id of candidates) {
    if (!repeat && played.has(id)) return false;
    if (await play(id)) return true;
  }
  return false;
};

/** An album skipped to its end: told to the server, which takes it out of the list as one played. */
const markPlayed = async (id: number): Promise<void> => {
  noteHeard(id);
  try {
    const { left } = await musicService.markListenNextPlayed(id);
    if (left) window.dispatchEvent(new CustomEvent(LISTEN_NEXT_LEFT_EVENT, { detail: left }));
  } catch {
    // Left in the list: the next album plays all the same.
  }
};

/** How the player goes on once album `id` of Listen Next is over. */
const optionsFor = (id: number): PlayOptions => ({
  queue: 'listenNext',
  onAlbumEnd: async how => {
    played.add(id);
    // ⏭ on its last track: the album was listened to, as one played to its end, and leaves the list,
    // its place in the list as it now is kept first, for the turn to go on after it.
    if (how === 'skipped' && !repeat) {
      order = withCurrent(await listIds(), order, id);
      await markPlayed(id);
    }
    const ids = await listIds();
    order = withCurrent(ids, order, id);
    listed = ids;
    return playFrom(albumsAfter(order, id, repeat));
  },
  // Taken out by hand while it plays: its track ends, then the next album.
  leaveAfterTrack: () => currentId === id && listed !== null && !listed.includes(id) && !departed.has(id),
  onCounted: () => noteHeard(id),
});

const play = async (id: number, index = 0, options: PlayOptions = optionsFor(id)): Promise<boolean> => {
  const started = await playAlbumById(id, options, index).catch(() => false);
  if (started) {
    currentId = id;
    noteSession(session => { if (!session.albums.includes(id)) session.albums.push(id); });
  }
  return started;
};

/** An album out of the list played to its end, then back to the track Listen Next was left on. */
const detourOptions = (id: number, back: DetourBack): PlayOptions => ({
  queue: 'listenNext',
  onAlbumEnd: async () => {
    noteSession(session => { session.detour = null; });
    if (await play(back.albumId, back.index)) return true;
    const ids = await listIds();
    order = withCurrent(ids, order, back.albumId);
    listed = ids;
    return playFrom(albumsAfter(order, back.albumId, repeat));
  },
  onCounted: () => noteHeard(id),
});

if (typeof window !== 'undefined') {
  window.addEventListener(LISTEN_NEXT_LEFT_EVENT, event => {
    const albumId = (event as CustomEvent<{ albumId?: number }>).detail?.albumId;
    if (typeof albumId === 'number') departed.add(albumId);
  });
}

export const listenNextQueue = {
  /**
   * After a reload, album `albumId` back in the player, paused: Listen Next
   * goes on after it as before, the list read again meanwhile.
   */
  restore: (albumId: number): PlayOptions => {
    const detour = readSession().detour;
    if (detour?.albumId === albumId) {
      currentId = albumId;
      return detourOptions(albumId, detour.back);
    }
    played.clear();
    currentId = albumId;
    order = [albumId];
    listed = null;
    listIds().then(ids => {
      if (currentId !== albumId) return;
      order = withCurrent(ids, order, albumId);
      listed = ids;
    }).catch(() => undefined);
    return optionsFor(albumId);
  },

  /** Plays Listen Next from `albumId`, from the top without it. False when nothing could be played. */
  start: async (albumId?: number): Promise<boolean> => {
    played.clear();
    writeStored(SESSION_KEY, JSON.stringify({ ...emptySession(), startedAt: Math.floor(Date.now() / 1000) }));
    order = await listIds();
    listed = order;
    const at = albumId == null ? -1 : order.indexOf(albumId);
    const turn = at < 0 ? order : [...order.slice(at), ...order.slice(0, at)];
    for (const id of turn) {
      if (await play(id)) return true;
    }
    return false;
  },

  /** The list as the page just read it, for an album taken out by hand to be noticed. */
  noteList: (ids: number[]): void => {
    if (player.getState().queue !== 'listenNext') return;
    order = withCurrent(ids, order, currentId);
    listed = ids;
  },

  /**
   * Jumps to track `index` of album `albumId`: of the album playing, the list
   * goes on as it did; of another album of the list, the one left stays in it
   * and comes round in the turn; of an album out of the list, a detour. False when
   * nothing could be played.
   */
  jumpTo: async (albumId: number, index: number): Promise<boolean> => {
    if (currentId == null) return false;
    if (albumId === currentId) {
      player.playTrack(index);
      return true;
    }
    const ids = await listIds();
    order = withCurrent(ids, order, currentId);
    listed = ids;
    if (ids.includes(albumId)) {
      noteSession(session => { session.detour = null; });
      return play(albumId, index);
    }
    // Out of the list: back where Listen Next was once it is over, the first detour's place kept.
    const back = readSession().detour?.back ?? { albumId: currentId, index: player.getState().index };
    const started = await play(albumId, index, detourOptions(albumId, back));
    if (started) noteSession(session => { session.detour = { albumId, back }; });
    return started;
  },

  /** The albums the tracks' dialog shows, the list read again. */
  albums: async (): Promise<{ gone: number[]; listed: number[] }> => {
    const ids = await listIds();
    listed = ids;
    return sessionAlbums(readSession(), ids, currentId);
  },

  /**
   * The albums still to come in this turn, in order, after the one playing (or
   * the one a detour goes back to, itself first): what the bar counts the time
   * left of and announces the next track from. Not Repeat's endless round.
   * The album playing is given by the player, which knows it first.
   */
  upcoming: (playing: number | null = currentId): number[] => {
    // `playing` as the player has it: the bar asks as an album starts, before Listen Next has noted it.
    const back = readSession().detour?.back.albumId ?? null;
    const from = back ?? playing;
    if (from == null) return [];
    const ahead: number[] = back != null && back !== playing ? [back] : [];
    for (const id of albumsAfter(order, from, false)) {
      if (!repeat && played.has(id)) break;
      if (id !== playing && !ahead.includes(id)) ahead.push(id);
    }
    return ahead;
  },

  /** This play's session, for the dialog to tell an album played to its end from one taken out. */
  session: (): ListenNextSession => readSession(),

  setRepeat: (value: boolean): void => {
    repeat = value;
  },
};

// A play of Listen Next left by a reload goes on from here.
registerQueue('listenNext', listenNextQueue.restore);

/** For tests: back to nothing played. */
export const resetListenNextQueue = (): void => {
  order = [];
  listed = null;
  currentId = null;
  repeat = false;
  played.clear();
  departed.clear();
  writeStored(SESSION_KEY, '');
};
