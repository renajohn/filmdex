import { getDatabase } from '../database';
import { localDay } from '../utils/localDay';

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
  /** Unix seconds of its last library report, null for none yet. */
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

const addPlay = (songId: string, playedAt: number): Promise<number> =>
  run(`INSERT INTO navidrome_plays (song_id, day, plays) VALUES (?, ?, 1)
    ON CONFLICT(song_id, day) DO UPDATE SET plays = plays + 1`, [songId, localDay(new Date(playedAt * 1000))]);

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

/** What Navidrome told the plugin, by the call it came by. */
export type EventType = 'scrobble' | 'nowPlaying' | 'playbackReport';

/** A song, an album or an artist as an account sees it in Navidrome, with all its fields. */
export interface LibraryItem {
  id: string;
  [field: string]: unknown;
}

export interface AccountLibrary {
  songs: LibraryItem[];
  albums: LibraryItem[];
  artists: LibraryItem[];
}

/** An event as DexVault keeps it: who, what, when, and all Navidrome said. */
export interface RecentEvent {
  type: EventType;
  user: string;
  songId: string | null;
  /** Unix seconds: the play's time for a scrobble, else when it came. */
  at: number;
  receivedAt: number;
  data: unknown;
}

/**
 * Playing and playback reports are kept fifteen months, for a year in music
 * looked back on with the months before it; plays, for good.
 */
const EVENTS_KEPT_MONTHS = 15;

/** Unix seconds of the same moment `months` calendar months earlier. */
const monthsBefore = (seconds: number, months: number): number => {
  const date = new Date(seconds * 1000);
  date.setMonth(date.getMonth() - months);
  return Math.floor(date.getTime() / 1000);
};

/**
 * Everything the DexVault plugin in Navidrome hands on, kept as it came:
 * every event of every account, and each account's library as it sees it.
 * What DexVault counts is drawn from them: each play with who and when,
 * added to the day-by-day plays, and the stars and hearts of each account.
 */
const NavidromeListener = {
  createTable: async (): Promise<void> => {
    await run(`CREATE TABLE IF NOT EXISTS navidrome_listens (
      navidrome_user TEXT NOT NULL,
      song_id TEXT NOT NULL,
      played_at INTEGER NOT NULL,
      counted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (navidrome_user, song_id, played_at)
    )`);
    // The first plays, of 2026-10-17, came before the flag: the other accounts' were counted on arrival.
    const columns = await all<{ name: string }>('PRAGMA table_info(navidrome_listens)');
    if (!columns.some(column => column.name === 'counted')) {
      await run('ALTER TABLE navidrome_listens ADD COLUMN counted INTEGER NOT NULL DEFAULT 0');
      await run('UPDATE navidrome_listens SET counted = 1 WHERE navidrome_user != ?', [process.env.NAVIDROME_USER || '']);
    }
    await run(`CREATE TABLE IF NOT EXISTS navidrome_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      navidrome_user TEXT NOT NULL,
      song_id TEXT,
      at INTEGER NOT NULL,
      received_at INTEGER NOT NULL,
      data TEXT NOT NULL,
      event_key TEXT UNIQUE
    )`);
    await run('CREATE INDEX IF NOT EXISTS idx_navidrome_events_at ON navidrome_events (at)');
    await run(`CREATE TABLE IF NOT EXISTS navidrome_library (
      navidrome_user TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('song', 'album', 'artist')),
      item_id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (navidrome_user, kind, item_id)
    )`);
    // Version 1 of the plugin sent only the stars and hearts; its next report brings them all.
    await run('DROP TABLE IF EXISTS navidrome_favourites');
    await run(`CREATE TABLE IF NOT EXISTS navidrome_listeners (
      navidrome_user TEXT PRIMARY KEY,
      favourites_at INTEGER
    )`);
    const listenerColumns = await all<{ name: string }>('PRAGMA table_info(navidrome_listeners)');
    if (!listenerColumns.some(column => column.name === 'account')) {
      await run('ALTER TABLE navidrome_listeners ADD COLUMN account TEXT');
    }
  },

  /**
   * Notes a play and adds it to its day's plays, once: Navidrome sends again
   * what it could not deliver, so the same play may come twice. True when it
   * was new.
   */
  addListen: (user: string, songId: string, playedAt: number): Promise<boolean> => serial(() => inTransaction(async () => {
    await run('INSERT OR IGNORE INTO navidrome_listeners (navidrome_user) VALUES (?)', [user]);
    const added = await run('INSERT OR IGNORE INTO navidrome_listens (navidrome_user, song_id, played_at, counted) VALUES (?, ?, ?, 1)',
      [user, songId, playedAt]);
    if (added > 0) await addPlay(songId, playedAt);
    return added > 0;
  })),

  /**
   * Counts `user`'s plays kept uncounted, from before the plugin counted
   * them, which the counters had not taken in yet: those after the song's
   * counter was last noted. The others are left, counted already. How many.
   */
  countUncounted: (user: string): Promise<number> => serial(() => inTransaction(async () => {
    const pending = await all<{ song_id: string; played_at: number }>(`
      SELECT l.song_id, l.played_at FROM navidrome_listens l
      LEFT JOIN navidrome_play_counts c ON c.song_id = l.song_id
      WHERE l.navidrome_user = ? AND l.counted = 0
        AND (c.updated_at IS NULL OR l.played_at > CAST(strftime('%s', c.updated_at) AS INTEGER))`, [user]);
    for (const play of pending) {
      await addPlay(play.song_id, play.played_at);
      await run('UPDATE navidrome_listens SET counted = 1 WHERE navidrome_user = ? AND song_id = ? AND played_at = ?', [user, play.song_id, play.played_at]);
    }
    return pending.length;
  })),

  /**
   * Keeps an event as it came, once: Navidrome sends a play again until it is
   * taken, so a play is known by who, what and when. True when it was new.
   */
  addEvent: (type: EventType, user: string, songId: string | null, at: number, data: unknown,
    now: number = Math.floor(Date.now() / 1000)): Promise<boolean> => serial(async () => {
    const key = type === 'scrobble' ? `${user}|${songId}|${at}` : null;
    const added = await run(`INSERT OR IGNORE INTO navidrome_events (type, navidrome_user, song_id, at, received_at, data, event_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [type, user, songId, at, now, JSON.stringify(data), key]);
    await run('INSERT OR IGNORE INTO navidrome_listeners (navidrome_user) VALUES (?)', [user]);
    return added > 0;
  }),

  /**
   * Replaces an account's library with the one it sees now, writing only
   * what changed since its last report: most hours, a few songs played or
   * liked. Forgets the events past their time. How many items it wrote and
   * removed.
   */
  replaceLibrary: (user: string, account: unknown, library: AccountLibrary, now: number = Math.floor(Date.now() / 1000)):
    Promise<{ written: number; removed: number }> => serial(async () => {
    const known = new Map((await all<{ kind: string; item_id: string; data: string }>(
      'SELECT kind, item_id, data FROM navidrome_library WHERE navidrome_user = ?', [user]))
      .map(row => [`${row.kind}|${row.item_id}`, row.data]));
    const changed: Array<[string, string, string]> = [];
    for (const [kind, items] of [['song', library.songs], ['album', library.albums], ['artist', library.artists]] as const) {
      for (const item of items) {
        const key = `${kind}|${item.id}`;
        const data = JSON.stringify(item);
        if (known.get(key) !== data) changed.push([kind, item.id, data]);
        known.delete(key);
      }
    }
    // What is left was not in this report: gone from the library, or from what the account sees.
    const gone = [...known.keys()].map(key => key.split('|') as [string, string]);
    return inTransaction(async () => {
      for (const [kind, id, data] of changed) {
        await run('INSERT OR REPLACE INTO navidrome_library (navidrome_user, kind, item_id, data) VALUES (?, ?, ?, ?)', [user, kind, id, data]);
      }
      for (const [kind, id] of gone) {
        await run('DELETE FROM navidrome_library WHERE navidrome_user = ? AND kind = ? AND item_id = ?', [user, kind, id]);
      }
      await run(`INSERT INTO navidrome_listeners (navidrome_user, favourites_at, account) VALUES (?, ?, ?)
        ON CONFLICT(navidrome_user) DO UPDATE SET favourites_at = excluded.favourites_at, account = excluded.account`,
      [user, now, account == null ? null : JSON.stringify(account)]);
      await run("DELETE FROM navidrome_events WHERE type != 'scrobble' AND at < ?", [monthsBefore(now, EVENTS_KEPT_MONTHS)]);
      return { written: changed.length, removed: gone.length };
    });
  }),

  /** The stars and hearts of every account but `except`, whose own DexVault reads fresh. */
  othersFavourites: async (except: string): Promise<OthersFavourites> => {
    const rows = await all<{ kind: string; item_id: string; rating: number; starred: number }>(`
      SELECT kind, item_id, rating, starred FROM (
        SELECT kind, item_id, COALESCE(json_extract(data, '$.userRating'), 0) AS rating,
          CASE WHEN json_extract(data, '$.starred') IS NULL THEN 0 ELSE 1 END AS starred
        FROM navidrome_library WHERE navidrome_user != ? AND kind IN ('song', 'album'))
      WHERE rating > 0 OR starred = 1`, [except]);
    return {
      songs: best(rows.filter(row => row.kind === 'song')),
      albums: best(rows.filter(row => row.kind === 'album')),
    };
  },

  /** The latest events, newest first, each as it came. */
  recentEvents: async (limit: number): Promise<RecentEvent[]> =>
    (await all<{ type: EventType; navidrome_user: string; song_id: string | null; at: number; received_at: number; data: string }>(
      'SELECT type, navidrome_user, song_id, at, received_at, data FROM navidrome_events ORDER BY received_at DESC, id DESC LIMIT ?', [limit]))
      .map(row => ({ type: row.type, user: row.navidrome_user, songId: row.song_id, at: row.at, receivedAt: row.received_at, data: JSON.parse(row.data) })),

  /** Every account the plugin has told of, by name. */
  listeners: async (): Promise<Listener[]> =>
    (await all<{ navidrome_user: string; favourites_at: number | null; last_listen: number | null }>(`
      SELECT l.navidrome_user, l.favourites_at, (SELECT MAX(played_at) FROM navidrome_listens WHERE navidrome_user = l.navidrome_user) AS last_listen
      FROM navidrome_listeners l ORDER BY l.navidrome_user`))
      .map(row => ({ user: row.navidrome_user, lastListen: row.last_listen ?? null, favouritesAt: row.favourites_at ?? null })),
};

export default NavidromeListener;
