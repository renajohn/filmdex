import { getDatabase } from '../database';

/** What sits on a shelf as one object: a CD, a film, or a box set of films kept together. */
export type ShelfKind = 'album' | 'movie' | 'box_set';

export const SHELF_KINDS: ShelfKind[] = ['album', 'movie', 'box_set'];

/** The runs of the shelves, each in its own order: the films (box sets among them), the classical CDs, the other CDs. */
export type ShelfSection = 'films' | 'music' | 'classical';

export const SHELF_SECTIONS: ShelfSection[] = ['films', 'music', 'classical'];

export interface ShelfItemRow {
  kind: ShelfKind;
  item_id: number;
  section: ShelfSection | null;
  shelve_under: string | null;
  place_id: number | null;
  /** The shelf the owner put it on by hand, out of the order. */
  level_id: number | null;
  units: number | null;
  artist_sort: string | null;
  artist_type: string | null;
  sort_fetched_at: string | null;
}

export interface ShelfPlaceRow {
  id: number;
  name: string;
  created_at: string;
}

/** What the owner set by hand for one object; every field left out is kept. */
export interface ShelfSettings {
  section?: ShelfSection | null;
  shelveUnder?: string | null;
  placeId?: number | null;
  /** A shelf to put it on by hand, out of the order. */
  levelId?: number | null;
  /** How many standard cases wide it stands, when the estimate from its discs is off. */
  units?: number | null;
}

const run = (sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> =>
  new Promise((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number; changes: number }, err: Error | null) {
      if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
    }));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const get = <T>(sql: string, params: unknown[] = []): Promise<T | null> =>
  new Promise((resolve, reject) =>
    getDatabase().get(sql, params, (err: Error | null, row: T | undefined) => (err ? reject(err) : resolve(row ?? null))));

/**
 * Where each physical object is kept. Rows hold only what cannot be worked
 * out: what the owner set by hand (a section, a name to shelve under, a place
 * off the shelves) and the artist's sort name MusicBrainz gave. An object
 * without a row is shelved by its own data alone.
 *
 * The places off the shelves are named, the top of a wardrobe for the box
 * sets too big for a shelf, so that a missing CD is looked for in the right
 * one.
 */
const ShelfItem = {
  createTable: async (): Promise<void> => {
    await run(`
      CREATE TABLE IF NOT EXISTS shelf_places (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS shelf_items (
        kind            TEXT NOT NULL,
        item_id         INTEGER NOT NULL,
        section         TEXT,
        shelve_under    TEXT,
        place_id        INTEGER REFERENCES shelf_places(id) ON DELETE SET NULL,
        level_id        INTEGER,
        units           REAL,
        artist_sort     TEXT,
        artist_type     TEXT,
        sort_fetched_at TEXT,
        PRIMARY KEY (kind, item_id)
      )
    `);
    const columns = await all<{ name: string }>(`PRAGMA table_info(shelf_items)`);
    if (!columns.some(column => column.name === 'units')) await run(`ALTER TABLE shelf_items ADD COLUMN units REAL`);
    if (!columns.some(column => column.name === 'level_id')) await run(`ALTER TABLE shelf_items ADD COLUMN level_id INTEGER`);
    // Box sets had a section of their own for a while; they stand among the films now.
    await run(`UPDATE shelf_items SET section = NULL WHERE section = 'box_sets'`);
    await run(`
      CREATE TABLE IF NOT EXISTS shelf_collections (
        collection_id INTEGER PRIMARY KEY REFERENCES collections(id) ON DELETE CASCADE,
        together      INTEGER NOT NULL DEFAULT 1
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS shelf_positions (
        kind    TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        place   TEXT,
        PRIMARY KEY (kind, item_id)
      )
    `);
    const collectionColumns = await all<{ name: string }>(`PRAGMA table_info(shelf_collections)`);
    if (!collectionColumns.some(column => column.name === 'together')) {
      await run(`ALTER TABLE shelf_collections ADD COLUMN together INTEGER NOT NULL DEFAULT 1`);
    }
  },

  /** Where each object stood when the owner last put the shelves in order: a shelf code, a place's name, or null for none. */
  standing: (): Promise<Array<{ kind: ShelfKind; item_id: number; place: string | null }>> =>
    all(`SELECT kind, item_id, place FROM shelf_positions`),

  /** The owner moved these objects where the plan has them. */
  saveStanding: async (positions: Array<{ kind: ShelfKind; id: number; place: string | null }>): Promise<void> => {
    for (const position of positions) {
      await run(
        `INSERT INTO shelf_positions (kind, item_id, place) VALUES (?, ?, ?)
         ON CONFLICT (kind, item_id) DO UPDATE SET place = excluded.place`,
        [position.kind, position.id, position.place]
      );
    }
  },

  /** Forgets objects that are no longer in the collection. */
  forgetStanding: async (kind: ShelfKind, itemId: number): Promise<void> => {
    await run(`DELETE FROM shelf_positions WHERE kind = ? AND item_id = ?`, [kind, itemId]);
  },

  /** Whether the owner keeps each collection together on the shelf, for those they decided; the others follow their name. */
  togetherChoices: async (): Promise<Map<number, boolean>> =>
    new Map((await all<{ collection_id: number; together: number }>(`SELECT collection_id, together FROM shelf_collections`))
      .map(row => [row.collection_id, !!row.together])),

  setTogether: async (collectionId: number, together: boolean): Promise<void> => {
    await run(
      `INSERT INTO shelf_collections (collection_id, together) VALUES (?, ?)
       ON CONFLICT (collection_id) DO UPDATE SET together = excluded.together`,
      [collectionId, together ? 1 : 0]
    );
  },

  all: (): Promise<ShelfItemRow[]> => all<ShelfItemRow>(`SELECT * FROM shelf_items`),

  get: (kind: ShelfKind, itemId: number): Promise<ShelfItemRow | null> =>
    get<ShelfItemRow>(`SELECT * FROM shelf_items WHERE kind = ? AND item_id = ?`, [kind, itemId]),

  /** Keeps what the owner set; a field set to null goes back to what the object's data says. */
  saveSettings: async (kind: ShelfKind, itemId: number, settings: ShelfSettings): Promise<void> => {
    await run(`INSERT OR IGNORE INTO shelf_items (kind, item_id) VALUES (?, ?)`, [kind, itemId]);
    const columns: Array<[keyof ShelfSettings, string]> = [['section', 'section'], ['shelveUnder', 'shelve_under'], ['placeId', 'place_id'], ['levelId', 'level_id'], ['units', 'units']];
    for (const [field, column] of columns) {
      if (settings[field] === undefined) continue;
      await run(`UPDATE shelf_items SET ${column} = ? WHERE kind = ? AND item_id = ?`, [settings[field], kind, itemId]);
    }
  },

  /** The sort name MusicBrainz gives the album's artist, "Michael, George", and whether it is a person or a group. */
  saveArtistSort: async (albumId: number, sortName: string | null, artistType: string | null): Promise<void> => {
    await run(`INSERT OR IGNORE INTO shelf_items (kind, item_id) VALUES ('album', ?)`, [albumId]);
    await run(
      `UPDATE shelf_items SET artist_sort = ?, artist_type = ?, sort_fetched_at = ? WHERE kind = 'album' AND item_id = ?`,
      [sortName, artistType, new Date().toISOString(), albumId]
    );
  },

  /** The albums whose artist's sort name has not been asked of MusicBrainz yet. */
  albumIdsWithoutSort: async (): Promise<Array<{ id: number; releaseId: string }>> =>
    (await all<{ id: number; release_id: string }>(`
      SELECT a.id, a.musicbrainz_release_id AS release_id
        FROM albums a
        LEFT JOIN shelf_items s ON s.kind = 'album' AND s.item_id = a.id
       WHERE a.musicbrainz_release_id IS NOT NULL AND a.musicbrainz_release_id != ''
         AND COALESCE(a.title_status, 'owned') = 'owned'
         AND s.sort_fetched_at IS NULL
       ORDER BY a.id
    `)).map(row => ({ id: row.id, releaseId: row.release_id })),

  places: (): Promise<ShelfPlaceRow[]> => all<ShelfPlaceRow>(`SELECT * FROM shelf_places ORDER BY name COLLATE NOCASE`),

  createPlace: async (name: string): Promise<ShelfPlaceRow> => {
    const { lastID } = await run(`INSERT INTO shelf_places (name, created_at) VALUES (?, ?)`, [name, new Date().toISOString()]);
    return (await get<ShelfPlaceRow>(`SELECT * FROM shelf_places WHERE id = ?`, [lastID]))!;
  },

  renamePlace: async (id: number, name: string): Promise<ShelfPlaceRow | null> => {
    await run(`UPDATE shelf_places SET name = ? WHERE id = ?`, [name, id]);
    return get<ShelfPlaceRow>(`SELECT * FROM shelf_places WHERE id = ?`, [id]);
  },

  /** What was kept there goes back to the shelves. */
  deletePlace: async (id: number): Promise<void> => {
    await run(`UPDATE shelf_items SET place_id = NULL WHERE place_id = ?`, [id]);
    await run(`DELETE FROM shelf_places WHERE id = ?`, [id]);
  },
};

export default ShelfItem;
