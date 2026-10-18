import Collection from '../models/collection';
import AlbumCollection from '../models/albumCollection';
import logger from '../logger';
import { getDatabase } from '../database';

interface CollectionAlbum {
  id: number;
  title: string;
  [key: string]: unknown;
}

interface CollectionRecord {
  id: number;
  name: string;
  type: string;
}

const musicCollectionService = {
  // Get Listen Next albums in reverse order (newest additions first)
  getListenNextAlbums: async (): Promise<CollectionAlbum[]> => {
    try {
      const listenNextCollection = await Collection.findByType('listen_next') as CollectionRecord | null;
      if (!listenNextCollection) {
        return [];
      }

      const albums = await Collection.getAlbums(listenNextCollection.id) as unknown as CollectionAlbum[];
      // Those a draw put there (Help me choose, the die), which offer the die; not those put by hand.
      const drawn = new Set((await new Promise<Array<{ album_id: number }>>((resolve, reject) => getDatabase().all(
        'SELECT album_id FROM album_collections WHERE collection_id = ? AND suggested = 1', [listenNextCollection.id],
        (err: Error | null, rows: Array<{ album_id: number }>) => (err ? reject(err) : resolve(rows || []))))).map(row => row.album_id));
      // Return in original order (oldest additions first, newest at the end)
      return albums.map(album => ({ ...album, suggested: drawn.has(album.id) }));
    } catch (error) {
      logger.error('Error getting Listen Next albums:', error);
      throw error;
    }
  },

  /**
   * Listen Next in the order given, dragged on its banner. An album the order
   * leaves out (added meanwhile) keeps its turn after those given; an album
   * no longer in the list is passed over.
   */
  reorderListenNext: async (albumIds: number[]): Promise<CollectionAlbum[]> => {
    const listenNextCollection = await Collection.findByType('listen_next') as CollectionRecord | null;
    if (!listenNextCollection) return [];
    const current = (await Collection.getAlbums(listenNextCollection.id) as unknown as CollectionAlbum[]).map(album => album.id);
    const given = [...new Set(albumIds)].filter(id => current.includes(id));
    const order = [...given, ...current.filter(id => !given.includes(id))];
    for (const [index, id] of order.entries()) {
      await AlbumCollection.updateOrder(id, listenNextCollection.id, index + 1);
    }
    return musicCollectionService.getListenNextAlbums();
  }
};

export default musicCollectionService;
