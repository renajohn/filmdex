import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';

const get = (sql: string, params: unknown[] = []): Promise<any> =>
  new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    getDatabase().run(sql, params, (err) => (err ? reject(err) : resolve()));
  });

describe('albums.discogs_release_id', () => {
  it('is added by a migration, with a unique index', async () => {
    const index = await get(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_albums_discogs_id_unique'"
    );
    expect(index?.name).toBe('idx_albums_discogs_id_unique');
  });

  it('is persisted and read back by the model', async () => {
    const album = await Album.create({
      title: 'From Discogs',
      artist: ['Test'],
      discogsReleaseId: '7156458'
    } as any);

    const stored = await Album.findById(album.id);
    expect(stored!.discogsReleaseId).toBe('7156458');
  });

  it('refuses a second album for the same Discogs release', async () => {
    await Album.create({ title: 'Dup A', artist: ['Test'], discogsReleaseId: 'dup-discogs' } as any);

    await expect(
      Album.create({ title: 'Dup B', artist: ['Test'], discogsReleaseId: 'dup-discogs' } as any)
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });

  it('still allows many albums with no Discogs id', async () => {
    await Album.create({ title: 'No Discogs 1', artist: ['Test'] } as any);
    await Album.create({ title: 'No Discogs 2', artist: ['Test'] } as any);

    const row = await get(
      "SELECT COUNT(*) AS n FROM albums WHERE discogs_release_id IS NULL AND title LIKE 'No Discogs %'"
    );
    expect(row.n).toBe(2);
  });

  it('can be found by its Discogs id', async () => {
    const album = await Album.create({
      title: 'Findable',
      artist: ['Test'],
      discogsReleaseId: 'findable-discogs'
    } as any);

    const found = await Album.findByDiscogsId('findable-discogs');
    expect(found?.id).toBe(album.id);
  });

  it('reports nothing for an unknown Discogs id', async () => {
    await expect(Album.findByDiscogsId('never-seen')).resolves.toBeNull();
  });

  it('keeps the id through an update', async () => {
    const album = await Album.create({
      title: 'Keep Me',
      artist: ['Test'],
      discogsReleaseId: 'keep-discogs'
    } as any);

    await Album.update(album.id, { title: 'Keep Me Renamed', artist: ['Test'] } as any);

    const row = await get('SELECT discogs_release_id FROM albums WHERE id = ?', [album.id]);
    expect(row.discogs_release_id).toBe('keep-discogs');
  });

  it('leaves rows created before the migration untouched', async () => {
    await run(
      `INSERT INTO albums (artist, title, created_at, updated_at)
       VALUES ('["Old"]', 'Legacy Row', datetime('now'), datetime('now'))`
    );

    const row = await get("SELECT discogs_release_id FROM albums WHERE title = 'Legacy Row'");
    expect(row.discogs_release_id).toBeNull();
  });
});
