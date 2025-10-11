const { getDatabase } = require('../database');

const Collection = {
  createTable: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS collections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  create: (collectionData) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { name, type = 'user', is_system = false } = collectionData;
      
      const sql = `
        INSERT INTO collections (name, type, is_system, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      
      db.run(sql, [name, type, is_system ? 1 : 0], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            name,
            type,
            is_system: !!is_system,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      });
    });
  },

  findByName: (name) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM collections WHERE name = ?';
      
      db.get(sql, [name], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  findById: (id) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM collections WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  getAll: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM collections ORDER BY name ASC';
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  getSuggestions: (query = '') => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT DISTINCT name 
        FROM collections 
        WHERE name LIKE ? 
        ORDER BY name ASC 
        LIMIT 10
      `;
      
      db.all(sql, [`%${query}%`], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.name));
        }
      });
    });
  },

  update: (id, collectionData) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { name } = collectionData;
      
      const sql = `
        UPDATE collections 
        SET name = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;
      
      db.run(sql, [name, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, name, changes: this.changes });
        }
      });
    });
  },

  delete: (id) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM collections WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, changes: this.changes });
        }
      });
    });
  },

  // Auto-create collection if it doesn't exist
  findOrCreate: (name) => {
    return new Promise(async (resolve, reject) => {
      try {
        // First try to find existing collection
        let collection = await Collection.findByName(name);
        
        if (collection) {
          resolve(collection);
        } else {
          // Create new collection
          collection = await Collection.create({ name });
          resolve(collection);
        }
      } catch (error) {
        reject(error);
      }
    });
  },

  // Get movies in a collection
  getMovies: (collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT m.*, mc.collection_order
        FROM movies m
        JOIN movie_collections mc ON m.id = mc.movie_id
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

  // Get collection count for a movie
  getMovieCollectionCount: (movieId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT COUNT(*) as count
        FROM movie_collections
        WHERE movie_id = ?
      `;
      
      db.get(sql, [movieId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });
  },

  // Check if collection is empty
  isEmpty: (collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT COUNT(*) as count
        FROM movie_collections
        WHERE collection_id = ?
      `;
      
      db.get(sql, [collectionId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count === 0);
        }
      });
    });
  },

  // Find collection by type
  findByType: (type) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM collections WHERE type = ?';
      
      db.get(sql, [type], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  // Initialize system collections
  initializeSystemCollections: () => {
    return new Promise(async (resolve, reject) => {
      try {
        const db = getDatabase();
        
        // Create Watch Next system collection if it doesn't exist
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT OR IGNORE INTO collections (name, type, is_system, created_at, updated_at)
            VALUES ('Watch Next', 'watch_next', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
};

module.exports = Collection;
