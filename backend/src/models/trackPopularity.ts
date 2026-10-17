import { getDatabase } from '../database';

/** A track's popularity on Deezer, by its place on the album. */
export interface TrackRank {
  discNumber: number;
  trackNumber: number;
  rank: number;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

/**
 * How much each track of an album is listened to on Deezer, to point at the
 * few that stand out. Kept by disc and position rather than on the tracks,
 * which an edit of the album deletes and writes again.
 */
const TrackPopularity = {
  createTable: async (): Promise<void> => {
    await run(`CREATE TABLE IF NOT EXISTS track_popularity (
      album_id INTEGER NOT NULL,
      disc_number INTEGER NOT NULL,
      track_number INTEGER NOT NULL,
      deezer_rank INTEGER NOT NULL,
      PRIMARY KEY (album_id, disc_number, track_number),
      FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE CASCADE
    )`);
    // When each album was last looked up, found on Deezer or not, so that it is not asked again every time.
    await run(`CREATE TABLE IF NOT EXISTS album_popularity (
      album_id INTEGER PRIMARY KEY,
      deezer_album_id TEXT,
      checked_at DATETIME NOT NULL,
      FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE CASCADE
    )`);
  },

  /** Replaces an album's ranks with those just read; none when Deezer does not have it. */
  save: async (albumId: number, deezerAlbumId: string | null, ranks: TrackRank[]): Promise<void> => {
    await run('DELETE FROM track_popularity WHERE album_id = ?', [albumId]);
    for (const { discNumber, trackNumber, rank } of ranks) {
      await run('INSERT OR REPLACE INTO track_popularity (album_id, disc_number, track_number, deezer_rank) VALUES (?, ?, ?, ?)',
        [albumId, discNumber, trackNumber, rank]);
    }
    await run('INSERT OR REPLACE INTO album_popularity (album_id, deezer_album_id, checked_at) VALUES (?, ?, ?)',
      [albumId, deezerAlbumId, new Date().toISOString()]);
  },

  findByAlbum: async (albumId: number): Promise<TrackRank[]> =>
    all<TrackRank>(`SELECT disc_number AS discNumber, track_number AS trackNumber, deezer_rank AS rank
      FROM track_popularity WHERE album_id = ?`, [albumId]),

  /** The albums with tracks never looked up, then those looked up before the date given, oldest first. */
  findDue: async (checkedBefore: string, limit: number): Promise<number[]> =>
    (await all<{ id: number }>(`SELECT a.id FROM albums a
      LEFT JOIN album_popularity p ON p.album_id = a.id
      WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = a.id)
        AND (p.checked_at IS NULL OR p.checked_at < ?)
      ORDER BY p.checked_at IS NOT NULL, p.checked_at, a.id
      LIMIT ?`, [checkedBefore, limit])).map(row => row.id),
};

export default TrackPopularity;
