import { getDatabase } from '../database';
import { localDay } from '../services/listenHistoryService';

/** A song's or an album's stars and heart, as one Navidrome account gave them. */
export interface Favourite {
  id: string;
  rating: number;
  starred: boolean;
}

/** The stars and hearts of other accounts, the best of them: a heart from any one counts. */
export interface OthersFavourites {
  songs: Map<string, Favourite>;
  albums: Map<string, Favourite>;
}

/** What DexVault last heard of an account through the plugin. */
export interface Listener {
  user: string;
  /** Unix seconds of its last play, null for none yet. */
  lastListen: number | null;
  /** Unix seconds of its last report of stars and hearts, null for none yet. */
  favouritesAt: number | null;
}

const run = (sql: string, params: unknown[] = []): Promise<number> =>
  new Promise((resolve, reject) => getDatabase().run(sql, params, function (this: { changes: number }, err: Error | null) {
    if (err) reject(err);
    else resolve(this.changes);
  }));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const inTransaction = async <T>(work: () => Promise<T>): Promise<T> => {
  await run('BEGIN');
  try {
    const result = await work();
    await run('COMMIT');
    return result;
  } catch (error) {
    await run('ROLLBACK').catch(() => undefined);
    throw error;
  }
};

// One write at a time: two plays arriving together must not open two transactions.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(work: () => Promise<T>): Promise<T> => {
  const next = queue.then(work);
  queue = next.catch(() => undefined);
  return next;
};

const best = (rows: Array<{ item_id: string; rating: number; starred: number }>): Map<string, Favourite> => {
  const byId = new Map<string, Favourite>();
  for (const row of rows) {
    const known = byId.get(row.item_id);
    byId.set(row.item_id, {
      id: row.item_id,
      rating: Math.max(known?.rating ?? 0, row.rating),
      starred: Boolean(known?.starred) || row.starred === 1,
    });
  }
  return byId;
};

/**
 * What every Navidrome account plays and likes, as the DexVault plugin in
 * Navidrome tells it: each play with who and when, and each account's stars
 * and hearts. The plays of accounts other than NAVIDROME_USER go into the
 * day-by-day plays; NAVIDROME_USER's are counted from its own counters, as
 * before, and only kept here.
 */
const NavidromeListener = {
  createTable: async (): Promise<void> => {
    await run(`CREATE TABLE IF NOT EXISTS navidrome_listens (
      navidrome_user TEXT NOT NULL,
      song_id TEXT NOT NULL,
      played_at INTEGER NOT NULL,
      PRIMARY KEY (navidrome_user, song_id, played_at)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS navidrome_favourites (
      navidrome_user TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('song', 'album')),
      item_id TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 0,
      starred INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (navidrome_user, kind, item_id)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS navidrome_listeners (
      navidrome_user TEXT PRIMARY KEY,
      favourites_at INTEGER
    )`);
  },

  /**
   * Notes a play, once: Navidrome sends again what it could not deliver, so
   * the same play may come twice. `counts` adds it to its day's plays.
   * True when it was new.
   */
  addListen: (user: string, songId: string, playedAt: number, counts: boolean): Promise<boolean> => serial(() => inTransaction(async () => {
    await run('INSERT OR IGNORE INTO navidrome_listeners (navidrome_user) VALUES (?)', [user]);
    const added = await run('INSERT OR IGNORE INTO navidrome_listens (navidrome_user, song_id, played_at) VALUES (?, ?, ?)', [user, songId, playedAt]);
    if (added > 0 && counts) {
      await run(`INSERT INTO navidrome_plays (song_id, day, plays) VALUES (?, ?, 1)
        ON CONFLICT(song_id, day) DO UPDATE SET plays = plays + 1`, [songId, localDay(new Date(playedAt * 1000))]);
    }
    return added > 0;
  })),

  /** Replaces an account's stars and hearts with what it has now. */
  replaceFavourites: (user: string, songs: Favourite[], albums: Favourite[], now: number = Math.floor(Date.now() / 1000)): Promise<void> =>
    serial(() => inTransaction(async () => {
      await run('DELETE FROM navidrome_favourites WHERE navidrome_user = ?', [user]);
      for (const [kind, items] of [['song', songs], ['album', albums]] as const) {
        for (const item of items) {
          await run('INSERT OR REPLACE INTO navidrome_favourites (navidrome_user, kind, item_id, rating, starred) VALUES (?, ?, ?, ?, ?)',
            [user, kind, item.id, item.rating, item.starred ? 1 : 0]);
        }
      }
      await run(`INSERT INTO navidrome_listeners (navidrome_user, favourites_at) VALUES (?, ?)
        ON CONFLICT(navidrome_user) DO UPDATE SET favourites_at = excluded.favourites_at`, [user, now]);
    })),

  /** The stars and hearts of every account but `except`, whose own DexVault reads fresh. */
  othersFavourites: async (except: string): Promise<OthersFavourites> => {
    const rows = await all<{ kind: string; item_id: string; rating: number; starred: number }>(
      'SELECT kind, item_id, rating, starred FROM navidrome_favourites WHERE navidrome_user != ?', [except]);
    return {
      songs: best(rows.filter(row => row.kind === 'song')),
      albums: best(rows.filter(row => row.kind === 'album')),
    };
  },

  /** Every account the plugin has told of, by name. */
  listeners: async (): Promise<Listener[]> =>
    (await all<{ navidrome_user: string; favourites_at: number | null; last_listen: number | null }>(`
      SELECT l.navidrome_user, l.favourites_at, (SELECT MAX(played_at) FROM navidrome_listens WHERE navidrome_user = l.navidrome_user) AS last_listen
      FROM navidrome_listeners l ORDER BY l.navidrome_user`))
      .map(row => ({ user: row.navidrome_user, lastListen: row.last_listen ?? null, favouritesAt: row.favourites_at ?? null })),
};

export default NavidromeListener;
