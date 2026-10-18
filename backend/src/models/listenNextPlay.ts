import { getDatabase } from '../database';

export interface ListenNextDeparture {
  id: number;
  albumId: number;
  /** Its place in Listen Next when it left, to put it back there. */
  collectionOrder: number | null;
  /** Unix seconds. */
  leftAt: number;
  /** It had come by a draw: Keep here puts it back so, with its die. */
  suggested: boolean;
}

interface DepartureRow {
  id: number;
  album_id: number;
  collection_order: number | null;
  left_at: number;
  suggested: number | null;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const get = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => getDatabase().get(sql, params, (err: Error | null, row: T) => (err ? reject(err) : resolve(row))));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const toDeparture = (row: DepartureRow): ListenNextDeparture => ({
  id: row.id, albumId: row.album_id, collectionOrder: row.collection_order, leftAt: row.left_at, suggested: Boolean(row.suggested),
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
    if (!(await all<{ name: string }>('PRAGMA table_info(listen_next_departures)')).some(column => column.name === 'suggested')) {
      await run('ALTER TABLE listen_next_departures ADD COLUMN suggested INTEGER NOT NULL DEFAULT 0');
    }
    await run(`CREATE TABLE IF NOT EXISTS listen_next_shuffles (
      album_id INTEGER PRIMARY KEY,
      places TEXT NOT NULL
    )`);
  },

  /** A mixtape played shuffled in Listen Next: its songs' places, in the order drawn; null when it plays in its own. */
  getShuffle: async (albumId: number): Promise<number[] | null> => {
    const row = await get<{ places: string }>('SELECT places FROM listen_next_shuffles WHERE album_id = ?', [albumId]);
    if (!row) return null;
    try {
      const places = JSON.parse(row.places);
      return Array.isArray(places) ? places : [];
    } catch {
      return [];
    }
  },

  setShuffle: async (albumId: number, places: number[]): Promise<void> =>
    run(`INSERT INTO listen_next_shuffles (album_id, places) VALUES (?, ?)
      ON CONFLICT(album_id) DO UPDATE SET places = excluded.places`, [albumId, JSON.stringify(places)]),

  clearShuffle: async (albumId: number): Promise<void> => run('DELETE FROM listen_next_shuffles WHERE album_id = ?', [albumId]),

  /** The mixtapes played shuffled. */
  shuffledAlbumIds: async (): Promise<number[]> =>
    (await all<{ album_id: number }>('SELECT album_id FROM listen_next_shuffles')).map(row => row.album_id),

  getRepeat: async (): Promise<boolean> =>
    (await get<{ value: string }>("SELECT value FROM listen_next_settings WHERE key = 'repeat'"))?.value === 'true',

  setRepeat: async (repeat: boolean): Promise<void> =>
    run(`INSERT INTO listen_next_settings (key, value) VALUES ('repeat', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(repeat)]),

  addDeparture: async (albumId: number, collectionOrder: number | null, leftAt: number, suggested = false): Promise<ListenNextDeparture> => {
    await run('INSERT INTO listen_next_departures (album_id, collection_order, left_at, suggested) VALUES (?, ?, ?, ?)',
      [albumId, collectionOrder, leftAt, suggested ? 1 : 0]);
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
