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
  createTable: async (): Promise<void> => {
    const db = getDatabase();
    await new Promise<void>((resolve, reject) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS release_group_lookups (
          release_id TEXT PRIMARY KEY,
          release_group_id TEXT,
          is_cd INTEGER,
          looked_up_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (err: Error | null) => (err ? reject(err) : resolve())
      );
    });
    // The first version of the table had no is_cd, and CREATE TABLE IF NOT
    // EXISTS leaves an existing table as it is: every read then failed. The
    // error only says the column is already there.
    await new Promise<void>(resolve => db.run('ALTER TABLE release_group_lookups ADD COLUMN is_cd INTEGER', () => resolve()));
  },

  /** undefined when never asked, or asked before DexVault noted whether it is a CD. */
  find: (releaseId: string): Promise<ReleaseInfo | undefined> =>
    new Promise((resolve, reject) => {
      getDatabase().get(
        'SELECT release_group_id, is_cd FROM release_group_lookups WHERE release_id = ? AND is_cd IS NOT NULL',
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
