import { getDatabase } from '../database';

export interface ReleaseInfo {
  releaseGroupId: string | null;
  /** Every medium of the edition is a CD: a download bought in FLAC is not one. */
  isCd: boolean;
}

/**
 * What DexVault needs to know of each MusicBrainz edition found in
 * Navidrome's tags, asked of MusicBrainz once: the Ripping page reads the
 * library every time.
 */
const ReleaseGroupLookup = {
  createTable: (): Promise<void> =>
    new Promise((resolve, reject) => {
      getDatabase().run(
        `CREATE TABLE IF NOT EXISTS release_group_lookups (
          release_id TEXT PRIMARY KEY,
          release_group_id TEXT,
          is_cd INTEGER NOT NULL DEFAULT 0,
          looked_up_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (err: Error | null) => (err ? reject(err) : resolve())
      );
    }),

  /** undefined when never asked. */
  find: (releaseId: string): Promise<ReleaseInfo | undefined> =>
    new Promise((resolve, reject) => {
      getDatabase().get(
        'SELECT release_group_id, is_cd FROM release_group_lookups WHERE release_id = ?',
        [releaseId],
        (err: Error | null, row?: { release_group_id: string | null; is_cd: number }) =>
          (err ? reject(err) : resolve(row ? { releaseGroupId: row.release_group_id, isCd: row.is_cd === 1 } : undefined))
      );
    }),

  save: (releaseId: string, info: ReleaseInfo): Promise<void> =>
    new Promise((resolve, reject) => {
      getDatabase().run(
        'INSERT OR REPLACE INTO release_group_lookups (release_id, release_group_id, is_cd, looked_up_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [releaseId, info.releaseGroupId, info.isCd ? 1 : 0],
        (err: Error | null) => (err ? reject(err) : resolve())
      );
    }),
};

export default ReleaseGroupLookup;
