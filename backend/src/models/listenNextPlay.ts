import { getDatabase } from '../database';

export interface ListenNextDeparture {
  id: number;
  albumId: number;
  /** Its place in Listen Next when it left, to put it back there. */
  collectionOrder: number | null;
  /** Unix seconds. */
  leftAt: number;
}

interface DepartureRow {
  id: number;
  album_id: number;
  collection_order: number | null;
  left_at: number;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const get = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => getDatabase().get(sql, params, (err: Error | null, row: T) => (err ? reject(err) : resolve(row))));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const toDeparture = (row: DepartureRow): ListenNextDeparture => ({
  id: row.id, albumId: row.album_id, collectionOrder: row.collection_order, leftAt: row.left_at,
});

/**
 * Playing Listen Next: whether an album played to its end stays (Repeat), and
 * the albums that left it so, for the page to show them going and to put one
 * back at its place.
 */
const ListenNextPlay = {
  createTable: async (): Promise<void> => {
    await run(`CREATE TABLE IF NOT EXISTS listen_next_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    await run(`CREATE TABLE IF NOT EXISTS listen_next_departures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER NOT NULL,
      collection_order INTEGER,
      left_at INTEGER NOT NULL,
      kept INTEGER NOT NULL DEFAULT 0
    )`);
    await run('CREATE INDEX IF NOT EXISTS idx_listen_next_departures_left ON listen_next_departures (left_at)');
  },

  getRepeat: async (): Promise<boolean> =>
    (await get<{ value: string }>("SELECT value FROM listen_next_settings WHERE key = 'repeat'"))?.value === 'true',

  setRepeat: async (repeat: boolean): Promise<void> =>
    run(`INSERT INTO listen_next_settings (key, value) VALUES ('repeat', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(repeat)]),

  addDeparture: async (albumId: number, collectionOrder: number | null, leftAt: number): Promise<ListenNextDeparture> => {
    await run('INSERT INTO listen_next_departures (album_id, collection_order, left_at) VALUES (?, ?, ?)', [albumId, collectionOrder, leftAt]);
    const row = await get<DepartureRow>('SELECT * FROM listen_next_departures WHERE rowid = last_insert_rowid()');
    return toDeparture(row!);
  },

  /** The departures since `since` (unix seconds) not taken back, oldest first. */
  departuresSince: async (since: number): Promise<ListenNextDeparture[]> =>
    (await all<DepartureRow>('SELECT * FROM listen_next_departures WHERE kept = 0 AND left_at >= ? ORDER BY left_at, id', [since])).map(toDeparture),

  findDeparture: async (id: number): Promise<ListenNextDeparture | null> => {
    const row = await get<DepartureRow>('SELECT * FROM listen_next_departures WHERE id = ? AND kept = 0', [id]);
    return row ? toDeparture(row) : null;
  },

  markKept: async (id: number): Promise<void> => run('UPDATE listen_next_departures SET kept = 1 WHERE id = ?', [id]),
};

export default ListenNextPlay;
