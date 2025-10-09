const { getDatabase } = require('../database');

const MovieCollection = {
  createTable: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS movie_collections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          movie_id INTEGER NOT NULL,
          collection_id INTEGER NOT NULL,
          collection_order INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE,
          FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE,
          UNIQUE(movie_id, collection_id)
        )
      `;
      db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  create: (movieCollectionData) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { movie_id, collection_id, collection_order } = movieCollectionData;
      
      const sql = `
        INSERT INTO movie_collections (movie_id, collection_id, collection_order, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      db.run(sql, [movie_id, collection_id, collection_order], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            movie_id,
            collection_id,
            collection_order,
            created_at: new Date().toISOString()
          });
        }
      });
    });
  },

  findByMovieId: (movieId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT mc.*, c.name as collection_name
        FROM movie_collections mc
        JOIN collections c ON mc.collection_id = c.id
        WHERE mc.movie_id = ?
        ORDER BY 
          CASE WHEN mc.collection_order IS NOT NULL THEN mc.collection_order ELSE 999999 END,
          c.name ASC
      `;
      
      db.all(sql, [movieId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  findByCollectionId: (collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT mc.*, m.title, m.release_date
        FROM movie_collections mc
        JOIN movies m ON mc.movie_id = m.id
        WHERE mc.collection_id = ?
        ORDER BY 
          CASE WHEN mc.collection_order IS NOT NULL THEN mc.collection_order ELSE 999999 END,
          m.release_date ASC,
          m.title ASC
      `;
      
      db.all(sql, [collectionId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  findByMovieAndCollection: (movieId, collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movie_collections WHERE movie_id = ? AND collection_id = ?';
      
      db.get(sql, [movieId, collectionId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  updateOrder: (movieId, collectionId, collectionOrder) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        UPDATE movie_collections 
        SET collection_order = ?
        WHERE movie_id = ? AND collection_id = ?
      `;
      
      db.run(sql, [collectionOrder, movieId, collectionId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ movieId, collectionId, collectionOrder, changes: this.changes });
        }
      });
    });
  },

  delete: (movieId, collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_collections WHERE movie_id = ? AND collection_id = ?';
      
      db.run(sql, [movieId, collectionId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ movieId, collectionId, changes: this.changes });
        }
      });
    });
  },

  deleteByMovieId: (movieId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_collections WHERE movie_id = ?';
      
      db.run(sql, [movieId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ movieId, changes: this.changes });
        }
      });
    });
  },

  deleteByCollectionId: (collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_collections WHERE collection_id = ?';
      
      db.run(sql, [collectionId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ collectionId, changes: this.changes });
        }
      });
    });
  },

  // Get the next order number for a collection
  getNextOrder: (collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT MAX(collection_order) as max_order
        FROM movie_collections
        WHERE collection_id = ? AND collection_order IS NOT NULL
      `;
      
      db.get(sql, [collectionId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve((row.max_order || 0) + 1);
        }
      });
    });
  },

  // Bulk update movie collections
  updateMovieCollections: (movieId, collectionNames) => {
    return new Promise(async (resolve, reject) => {
      try {
        const db = getDatabase();
        
        // Start transaction
        db.run('BEGIN TRANSACTION');
        
        try {
          // Remove all existing collections for this movie
          await MovieCollection.deleteByMovieId(movieId);
          
          // Add new collections
          const Collection = require('./collection');
          const results = [];
          
          for (const collectionName of collectionNames) {
            if (collectionName.trim()) {
              // Find or create collection
              const collection = await Collection.findOrCreate(collectionName.trim());
              
              // Add movie to collection
              const result = await MovieCollection.create({
                movie_id: movieId,
                collection_id: collection.id,
                collection_order: null // Will be ordered by release date by default
              });
              
              results.push(result);
            }
          }
          
          // Commit transaction
          db.run('COMMIT');
          resolve(results);
          
        } catch (error) {
          // Rollback transaction
          db.run('ROLLBACK');
          throw error;
        }
        
      } catch (error) {
        reject(error);
      }
    });
  }
};

module.exports = MovieCollection;
