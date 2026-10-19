import { getDatabase } from '../../src/database';
import AlbumCollection from '../../src/models/albumCollection';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<void>((resolve, reject) => getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));
const all = <T>(sql: string, params: unknown[] = []) =>
  new Promise<T[]>((resolve, reject) => getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

describe('album_collections avec un disque', () => {
  it('refait la table d’avant, sans rien perdre, pour qu’un album y soit une fois par disque', async () => {
    const [{ id: collectionId }] = await all<{ id: number }>("SELECT id FROM collections WHERE type = 'listen_next'");
    await run("INSERT INTO albums (title, artist, format, title_status) VALUES ('Old', '[\"A\"]', 'CD', 'owned')");
    const [{ id: albumId }] = await all<{ id: number }>("SELECT id FROM albums WHERE title = 'Old'");

    await run('DROP TABLE album_collections');
    await run(`CREATE TABLE album_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT, album_id INTEGER NOT NULL, collection_id INTEGER NOT NULL,
      collection_order INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, suggested INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE CASCADE,
      FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE,
      UNIQUE(album_id, collection_id))`);
    await run('INSERT INTO album_collections (id, album_id, collection_id, collection_order, suggested) VALUES (7, ?, ?, 3, 1)', [albumId, collectionId]);

    await AlbumCollection.createTable();
    await AlbumCollection.createTable();

    expect(await all('SELECT id, album_id, collection_order, suggested, disc FROM album_collections'))
      .toEqual([{ id: 7, album_id: albumId, collection_order: 3, suggested: 1, disc: 0 }]);
    await AlbumCollection.create({ album_id: albumId, collection_id: collectionId, collection_order: 4, disc: 2 });
    await expect(AlbumCollection.create({ album_id: albumId, collection_id: collectionId, collection_order: 5, disc: 2 })).rejects.toThrow(/UNIQUE/);
    expect((await AlbumCollection.findByAlbumAndCollection(albumId, collectionId, 2))?.collection_order).toBe(4);
    // Its album deleted, its rows go with it.
    await run('DELETE FROM albums WHERE id = ?', [albumId]);
    expect(await all('SELECT id FROM album_collections WHERE album_id = ?', [albumId])).toEqual([]);
  });
});
