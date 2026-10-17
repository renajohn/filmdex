import musicService from './musicService';
import { LISTEN_NEXT_LEFT_EVENT, player } from './player';
import { playAlbumById } from '../utils/playAlbum';

/**
 * Listen Next played on the computer, album after album. The list is read
 * again at the end of each album, so what is added, taken out or moved since
 * counts: the next album is the one after the album playing in the list as it
 * now is, the first one after the last. An album played to its end leaves the
 * list on the server, by its scrobble, unless Repeat is on.
 *
 * With Repeat off, the play stops when nothing is left, or when it comes back
 * to an album skipped or played in this play: a skipped album comes round
 * once, not for ever.
 */

/** The list as last read, the album playing kept at its place even once out of it. */
let order: number[] = [];
/** The list as last read, as it is. */
let listed: number[] = [];
let currentId: number | null = null;
let repeat = false;
const skipped = new Set<number>();
const played = new Set<number>();
/** Albums that left the list once played, as the server said: not taken out by hand. */
const departed = new Set<number>();

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
    if (!repeat && (skipped.has(id) || played.has(id))) return false;
    if (await play(id)) return true;
  }
  return false;
};

const play = async (id: number): Promise<boolean> => {
  const started = await playAlbumById(id, {
    queue: 'listenNext',
    onAlbumEnd: async how => {
      if (how === 'skipped') skipped.add(id);
      else played.add(id);
      const ids = await listIds();
      order = withCurrent(ids, order, id);
      listed = ids;
      return playFrom(albumsAfter(order, id, repeat));
    },
    // Taken out by hand while it plays: its track ends, then the next album.
    leaveAfterTrack: () => currentId === id && !listed.includes(id) && !departed.has(id),
  }).catch(() => false);
  if (started) currentId = id;
  return started;
};

if (typeof window !== 'undefined') {
  window.addEventListener(LISTEN_NEXT_LEFT_EVENT, event => {
    const albumId = (event as CustomEvent<{ albumId?: number }>).detail?.albumId;
    if (typeof albumId === 'number') departed.add(albumId);
  });
}

export const listenNextQueue = {
  /** Plays Listen Next from `albumId`, from the top without it. False when nothing could be played. */
  start: async (albumId?: number): Promise<boolean> => {
    skipped.clear();
    played.clear();
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

  setRepeat: (value: boolean): void => {
    repeat = value;
  },
};

/** For tests: back to nothing played. */
export const resetListenNextQueue = (): void => {
  order = [];
  listed = [];
  currentId = null;
  repeat = false;
  skipped.clear();
  played.clear();
  departed.clear();
};
