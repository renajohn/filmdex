import Collection from '../models/collection';
import MovieCollection from '../models/movieCollection';
import logger from '../logger';
import type { CollectionRow, CollectionData, MovieCollectionRow, MovieRow } from '../types';

interface CollectionWithCount extends CollectionRow {
  movie_count: number;
}

interface CollectionMoviesResult {
  collection: CollectionRow;
  movies: Array<MovieRow & { collection_order: number | null }>;
}

const collectionService = {
  // Get all collections with movie counts
  getAllCollections: async (): Promise<CollectionWithCount[]> => {
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

  // Find collection by name
  findByName: async (name: string): Promise<CollectionRow | undefined> => {
    try {
      return await Collection.findByName(name);
    } catch (error) {
      logger.error('Error finding collection by name:', error);
      throw error;
    }
  },

  // Get collection suggestions for typeahead
  getSuggestions: async (query: string = ''): Promise<string[]> => {
    try {
      return await Collection.getSuggestions(query);
    } catch (error) {
      logger.error('Error getting collection suggestions:', error);
      throw error;
    }
  },

  // Create a new collection
  createCollection: async (name: string): Promise<{ id: number; name: string; type: string }> => {
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
  updateCollection: async (id: number, newName: string): Promise<{ id: number; name: string; changes: number }> => {
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

  // Get Watch Next movies in reverse order (newest additions first)
  getWatchNextMovies: async (): Promise<Array<MovieRow & { collection_order: number | null }>> => {
    try {
      const watchNextCollection = await Collection.findByType('watch_next');
      if (!watchNextCollection) {
        return [];
      }

      const movies = await Collection.getMovies(watchNextCollection.id);
      // Return in reverse order (newest additions first)
      return movies.reverse();
    } catch (error) {
      logger.error('Error getting Watch Next movies:', error);
      throw error;
    }
  },

  // Delete collection
  deleteCollection: async (id: number): Promise<{ id: number; changes: number }> => {
    try {
      // Check if this is a system collection
      const collection = await Collection.findById(id);
      if (!collection) {
        throw new Error('Collection not found');
      }
      if (collection.is_system) {
        throw new Error('Cannot delete system collections');
      }

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
  getCollectionMovies: async (collectionId: number): Promise<CollectionMoviesResult> => {
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
  addMovieToCollection: async (movieId: number, collectionName: string, collectionType: string = 'user'): Promise<{ message?: string; collection: CollectionRow | { id: number; name: string; type: string }; movieCollection?: { id: number; movie_id: number; collection_id: number; collection_order: number | null; created_at: string } }> => {
    try {
      // First check if a collection with this name and type already exists
      const existingCollection = await Collection.findByName(collectionName);

      let collection: CollectionRow | { id: number; name: string; type: string };
      if (existingCollection && existingCollection.type === collectionType) {
        // Use existing collection
        collection = existingCollection;
      } else if (existingCollection && existingCollection.type !== collectionType) {
        // Collection exists but with different type - this is an error
        throw new Error(`Collection "${collectionName}" already exists as a ${existingCollection.type} collection`);
      } else {
        // Create new collection with specified type
        collection = await Collection.create({
          name: collectionName,
          type: collectionType,
          is_system: collectionType === 'watch_next' ? 1 : 0
        });
      }

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
  removeMovieFromCollection: async (movieId: number, collectionId: number): Promise<{ movieId: number; collectionId: number; changes: number }> => {
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
  updateMovieCollections: async (movieId: number, collectionNames: string[]): Promise<Array<{ id: number; movie_id: number; collection_id: number; collection_order: number | null; created_at: string }>> => {
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
  handleCollectionNameChange: async (oldName: string, newName: string, action: 'rename' | 'create' = 'create'): Promise<{ id: number; name: string }> => {
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
  getMovieCollections: async (movieId: number): Promise<MovieCollectionRow[]> => {
    try {
      return await MovieCollection.findByMovieId(movieId);
    } catch (error) {
      logger.error('Error getting movie collections:', error);
      throw error;
    }
  },

  // Update movie order in collection
  updateMovieOrder: async (movieId: number, collectionId: number, order: number): Promise<{ movieId: number; collectionId: number; collectionOrder: number | null; changes: number }> => {
    try {
      return await MovieCollection.updateOrder(movieId, collectionId, order);
    } catch (error) {
      logger.error('Error updating movie order:', error);
      throw error;
    }
  },

  // Clean up empty collections
  cleanupEmptyCollections: async (): Promise<{ cleanedCount: number }> => {
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

export default collectionService;
