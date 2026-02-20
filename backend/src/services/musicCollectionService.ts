import Collection from '../models/collection';
import logger from '../logger';

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
      // Return in original order (oldest additions first, newest at the end)
      return albums;
    } catch (error) {
      logger.error('Error getting Listen Next albums:', error);
      throw error;
    }
  }
};

export default musicCollectionService;
