const Collection = require('../models/collection');
const AlbumCollection = require('../models/albumCollection');
const logger = require('../logger');

const musicCollectionService = {
  // Get Listen Next albums in reverse order (newest additions first)
  getListenNextAlbums: async () => {
    try {
      const listenNextCollection = await Collection.findByType('listen_next');
      if (!listenNextCollection) {
        return [];
      }
      
      const albums = await Collection.getAlbums(listenNextCollection.id);
      // Return in reverse order (newest additions first)
      return albums.reverse();
    } catch (error) {
      logger.error('Error getting Listen Next albums:', error);
      throw error;
    }
  }
};

module.exports = musicCollectionService;

