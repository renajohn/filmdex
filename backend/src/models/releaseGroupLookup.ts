import { getDatabase } from '../database';

/**
 * The release group of each MusicBrainz edition found in Navidrome's tags,
 * asked of MusicBrainz once: the Ripping page reads the library every time.
 */
const ReleaseGroupLookup = {
  createTable: (): Promise<void> =>
    new Promise((resolve, reject) => {
      getDatabase().run(
        `CREATE TABLE IF NOT EXISTS release_group_lookups (
          release_id TEXT PRIMARY KEY,
          release_group_id TEXT,
          looked_up_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (err: Error | null) => (err ? reject(err) : resolve())
      );
    }),

  /** undefined when never asked, null when MusicBrainz had no answer. */
  find: (releaseId: string): Promise<string | null | undefined> =>
    new Promise((resolve, reject) => {
      getDatabase().get(
        'SELECT release_group_id FROM release_group_lookups WHERE release_id = ?',
        [releaseId],
        (err: Error | null, row?: { release_group_id: string | null }) => (err ? reject(err) : resolve(row ? row.release_group_id : undefined))
      );
    }),

  save: (releaseId: string, releaseGroupId: string | null): Promise<void> =>
    new Promise((resolve, reject) => {
      getDatabase().run(
        'INSERT OR REPLACE INTO release_group_lookups (release_id, release_group_id, looked_up_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [releaseId, releaseGroupId],
        (err: Error | null) => (err ? reject(err) : resolve())
      );
    }),
};

export default ReleaseGroupLookup;
