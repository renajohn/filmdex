import Album from '../../src/models/album';
import AlbumCollection from '../../src/models/albumCollection';
import Collection from '../../src/models/collection';
import collectionService from '../../src/services/collectionService';

describe('cleanupEmptyCollections — runs after every movie deletion', () => {
  it('keeps Listen Next, even when it is empty', async () => {
    await collectionService.cleanupEmptyCollections();

    expect(await Collection.findByType('listen_next')).toBeTruthy();
    expect(await Collection.findByType('watch_next')).toBeTruthy();
  });

  it('keeps a box set that only holds albums', async () => {
    const album = await Album.create({ title: 'Boxed Album', artist: ['Test'], titleStatus: 'owned' } as any);
    const boxSet = await Collection.create({ name: 'Album Box Set', type: 'box_set' } as any);
    await AlbumCollection.create({ album_id: album.id, collection_id: boxSet.id, collection_order: 1 });

    await collectionService.cleanupEmptyCollections();

    expect(await Collection.findById(boxSet.id)).toBeTruthy();
  });

  it('still removes a collection with nothing in it', async () => {
    const empty = await Collection.create({ name: 'Nothing Here', type: 'user' } as any);

    await collectionService.cleanupEmptyCollections();

    expect(await Collection.findById(empty.id)).toBeFalsy();
  });
});
