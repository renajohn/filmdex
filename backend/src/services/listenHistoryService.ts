import NavidromePlay, { type DayPlays, type PlayChange } from '../models/navidromePlay';
import type { NavidromeSong } from './navidromeService';
import logger from '../logger';

/** A day as YYYY-MM-DD in the server's time zone: a late evening play is not the next day's. */
export const localDay = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const dayOf = (played: string | null | undefined, now: Date): string => {
  const date = played ? new Date(played) : now;
  return localDay(Number.isNaN(date.getTime()) ? now : date);
};

/**
 * What the counters gained since they were last noted, dated by each song's
 * last play rather than by the reading: a reading missed for a day still puts
 * the plays on their day. A song seen for the first time brings its whole
 * count, on the day of its last play; that is how the plays made before
 * DexVault kept a history are taken in.
 */
export const changesFrom = (songs: NavidromeSong[], known: Map<string, number>, now: Date = new Date()): PlayChange[] =>
  songs.flatMap(song => {
    if (!song.id) return [];
    const count = song.playCount ?? 0;
    const before = known.get(song.id);
    if (before === count) return [];
    return [{ songId: song.id, playCount: count, day: dayOf(song.played, now), plays: Math.max(0, count - (before ?? 0)) }];
  });

// Two readings of the library at once must not both count the same plays.
let queue: Promise<unknown> = Promise.resolve();

const listenHistoryService = {
  /** Turns what Navidrome's counters gained into dated plays. */
  record: (songs: NavidromeSong[]): Promise<number> => {
    const next = queue.then(async () => {
      const changes = changesFrom(songs, await NavidromePlay.counts());
      await NavidromePlay.record(changes);
      const plays = changes.reduce((sum, change) => sum + change.plays, 0);
      if (plays > 0) logger.info(`Navidrome: ${plays} plays noted`);
      return plays;
    });
    queue = next.catch(() => undefined);
    return next;
  },

  /** The plays of the last `days` days, today included. */
  recent: (days: number, now: Date = new Date()): Promise<DayPlays[]> => {
    const from = new Date(now);
    from.setDate(from.getDate() - (days - 1));
    return NavidromePlay.since(localDay(from));
  },

  /** Every hour, once the server has settled: reading the library notes the plays. */
  startRecording: (readLibrary: () => Promise<unknown>): void => {
    const tick = () => { readLibrary().catch(error => logger.warn(`Plays not noted from Navidrome: ${(error as Error).message}`)); };
    setTimeout(tick, 2 * 60 * 1000).unref();
    setInterval(tick, 60 * 60 * 1000).unref();
  },
};

export default listenHistoryService;
