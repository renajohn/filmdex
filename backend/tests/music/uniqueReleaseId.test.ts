import { getDatabase } from '../../src/database';

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    getDatabase().run(sql, params, (err) => (err ? reject(err) : resolve()));
  });

const get = (sql: string, params: unknown[] = []): Promise<any> =>
  new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const insertAlbum = (mbid: string | null, title: string) =>
  run(
    `INSERT INTO albums (artist, title, musicbrainz_release_id, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    ['["Test"]', title, mbid]
  );

describe('albums.musicbrainz_release_id uniqueness', () => {
  it('refuses a second row for the same MusicBrainz release', async () => {
    await insertAlbum('unique-guard-mbid', 'First');

    // The application checks for duplicates before inserting, but two
    // simultaneous requests (a double tap) can both pass that check; the
    // database has to be the last line of defence.
    await expect(insertAlbum('unique-guard-mbid', 'Second')).rejects.toThrow(/UNIQUE|constraint/i);
  });

  it('still allows many albums without a MusicBrainz id', async () => {
    await insertAlbum(null, 'Manual One');
    await insertAlbum(null, 'Manual Two');

    const row = await get(
      "SELECT COUNT(*) AS n FROM albums WHERE musicbrainz_release_id IS NULL AND title LIKE 'Manual %'"
    );
    expect(row.n).toBe(2);
  });

  it('applies to databases that already existed, through a migration', async () => {
    const row = await get(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_albums_musicbrainz_id_unique'"
    );
    expect(row?.name).toBe('idx_albums_musicbrainz_id_unique');
  });
});
