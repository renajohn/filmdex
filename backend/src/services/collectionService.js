const Collection = require('../models/collection');
const MovieCollection = require('../models/movieCollection');
const logger = require('../logger');

const collectionService = {
  // Get all collections with movie counts
  getAllCollections: async () => {
    try {
      const collections = await Collection.getAll();
      const collectionsWithCounts = await Promise.all(
        collections.map(async (collection) => {
          const movies = await Collection.getMovies(collection.id);
          return {
            ...collection,
            movie_count: movies.length
          };
        })
      );
      
      return collectionsWithCounts;
    } catch (error) {
      logger.error('Error getting all collections:', error);
      throw error;
    }
  },

  // Get collection suggestions for typeahead
  getSuggestions: async (query = '') => {
    try {
      return await Collection.getSuggestions(query);
    } catch (error) {
      logger.error('Error getting collection suggestions:', error);
      throw error;
    }
  },

  // Create a new collection
  createCollection: async (name) => {
    try {
      // Check if collection already exists
      const existing = await Collection.findByName(name);
      if (existing) {
        throw new Error(`Collection "${name}" already exists`);
      }
      
      return await Collection.create({ name });
    } catch (error) {
      logger.error('Error creating collection:', error);
      throw error;
    }
  },

  // Update collection name
  updateCollection: async (id, newName) => {
    try {
      // Check if new name already exists
      const existing = await Collection.findByName(newName);
      if (existing && existing.id !== id) {
        throw new Error(`Collection "${newName}" already exists`);
      }
      
      return await Collection.update(id, { name: newName });
    } catch (error) {
      logger.error('Error updating collection:', error);
      throw error;
    }
  },

  // Delete collection
  deleteCollection: async (id) => {
    try {
      // Check if collection is empty
      const isEmpty = await Collection.isEmpty(id);
      if (!isEmpty) {
        throw new Error('Cannot delete collection that contains movies');
      }
      
      return await Collection.delete(id);
    } catch (error) {
      logger.error('Error deleting collection:', error);
      throw error;
    }
  },

  // Get movies in a collection
  getCollectionMovies: async (collectionId) => {
    try {
      const collection = await Collection.findById(collectionId);
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      const movies = await Collection.getMovies(collectionId);
      return {
        collection,
        movies
      };
    } catch (error) {
      logger.error('Error getting collection movies:', error);
      throw error;
    }
  },

  // Add movie to collection (auto-creates collection if needed)
  addMovieToCollection: async (movieId, collectionName) => {
    try {
      // Find or create collection
      const collection = await Collection.findOrCreate(collectionName);
      
      // Check if movie is already in this collection
      const existing = await MovieCollection.findByMovieAndCollection(movieId, collection.id);
      if (existing) {
        return { message: 'Movie already in collection', collection };
      }
      
      // Add movie to collection
      const result = await MovieCollection.create({
        movie_id: movieId,
        collection_id: collection.id,
        collection_order: null
      });
      
      return { collection, movieCollection: result };
    } catch (error) {
      logger.error('Error adding movie to collection:', error);
      throw error;
    }
  },

  // Remove movie from collection
  removeMovieFromCollection: async (movieId, collectionId) => {
    try {
      const result = await MovieCollection.delete(movieId, collectionId);
      
      // Check if collection is now empty and clean it up
      const isEmpty = await Collection.isEmpty(collectionId);
      if (isEmpty) {
        await Collection.delete(collectionId);
        logger.info(`Deleted empty collection ${collectionId}`);
      }
      
      return result;
    } catch (error) {
      logger.error('Error removing movie from collection:', error);
      throw error;
    }
  },

  // Update movie's collections (replaces all collections)
  updateMovieCollections: async (movieId, collectionNames) => {
    try {
      // Get current collections for this movie
      const currentCollections = await MovieCollection.findByMovieId(movieId);
      const currentCollectionIds = currentCollections.map(c => c.collection_id);
      
      // Update movie collections
      const results = await MovieCollection.updateMovieCollections(movieId, collectionNames);
      
      // Clean up empty collections
      for (const collectionId of currentCollectionIds) {
        const isEmpty = await Collection.isEmpty(collectionId);
        if (isEmpty) {
          await Collection.delete(collectionId);
          logger.info(`Deleted empty collection ${collectionId}`);
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Error updating movie collections:', error);
      throw error;
    }
  },

  // Handle collection name change (rename vs create new)
  handleCollectionNameChange: async (oldName, newName, action = 'create') => {
    try {
      if (action === 'rename') {
        // Find the old collection
        const oldCollection = await Collection.findByName(oldName);
        if (!oldCollection) {
          throw new Error(`Collection "${oldName}" not found`);
        }
        
        // Check if new name already exists
        const existing = await Collection.findByName(newName);
        if (existing) {
          throw new Error(`Collection "${newName}" already exists`);
        }
        
        // Rename the collection
        return await Collection.update(oldCollection.id, { name: newName });
        
      } else if (action === 'create') {
        // Create new collection with new name
        return await Collection.create({ name: newName });
        
      } else {
        throw new Error('Invalid action. Must be "rename" or "create"');
      }
    } catch (error) {
      logger.error('Error handling collection name change:', error);
      throw error;
    }
  },

  // Get movie's collections
  getMovieCollections: async (movieId) => {
    try {
      return await MovieCollection.findByMovieId(movieId);
    } catch (error) {
      logger.error('Error getting movie collections:', error);
      throw error;
    }
  },

  // Update movie order in collection
  updateMovieOrder: async (movieId, collectionId, order) => {
    try {
      return await MovieCollection.updateOrder(movieId, collectionId, order);
    } catch (error) {
      logger.error('Error updating movie order:', error);
      throw error;
    }
  },

  // Clean up empty collections
  cleanupEmptyCollections: async () => {
    try {
      const collections = await Collection.getAll();
      let cleanedCount = 0;
      
      for (const collection of collections) {
        const isEmpty = await Collection.isEmpty(collection.id);
        if (isEmpty) {
          await Collection.delete(collection.id);
          cleanedCount++;
          logger.info(`Cleaned up empty collection: ${collection.name}`);
        }
      }
      
      return { cleanedCount };
    } catch (error) {
      logger.error('Error cleaning up empty collections:', error);
      throw error;
    }
  }
};

module.exports = collectionService;
