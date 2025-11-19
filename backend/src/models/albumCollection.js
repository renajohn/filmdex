const { getDatabase } = require('../database');

const AlbumCollection = {
  createTable: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS album_collections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          album_id INTEGER NOT NULL,
          collection_id INTEGER NOT NULL,
          collection_order INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE CASCADE,
          FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE,
          UNIQUE(album_id, collection_id)
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

  create: (albumCollectionData) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { album_id, collection_id, collection_order } = albumCollectionData;
      
      const sql = `
        INSERT INTO album_collections (album_id, collection_id, collection_order, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      db.run(sql, [album_id, collection_id, collection_order], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            album_id,
            collection_id,
            collection_order,
            created_at: new Date().toISOString()
          });
        }
      });
    });
  },

  findByAlbumId: (albumId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT ac.*, c.name as collection_name
        FROM album_collections ac
        JOIN collections c ON ac.collection_id = c.id
        WHERE ac.album_id = ?
        ORDER BY 
          CASE WHEN ac.collection_order IS NOT NULL THEN ac.collection_order ELSE 999999 END,
          c.name ASC
      `;
      
      db.all(sql, [albumId], (err, rows) => {
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
        SELECT ac.*, a.title, a.release_year
        FROM album_collections ac
        JOIN albums a ON ac.album_id = a.id
        WHERE ac.collection_id = ?
        ORDER BY 
          CASE WHEN ac.collection_order IS NOT NULL THEN ac.collection_order ELSE 999999 END,
          a.release_year ASC,
          a.title ASC
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

  findByAlbumAndCollection: (albumId, collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM album_collections WHERE album_id = ? AND collection_id = ?';
      
      db.get(sql, [albumId, collectionId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  updateOrder: (albumId, collectionId, collectionOrder) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        UPDATE album_collections 
        SET collection_order = ?
        WHERE album_id = ? AND collection_id = ?
      `;
      
      db.run(sql, [collectionOrder, albumId, collectionId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ albumId, collectionId, collectionOrder, changes: this.changes });
        }
      });
    });
  },

  delete: (albumId, collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM album_collections WHERE album_id = ? AND collection_id = ?';
      
      db.run(sql, [albumId, collectionId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ albumId, collectionId, changes: this.changes });
        }
      });
    });
  },

  deleteByAlbumId: (albumId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM album_collections WHERE album_id = ?';
      
      db.run(sql, [albumId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ albumId, changes: this.changes });
        }
      });
    });
  },

  deleteByCollectionId: (collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM album_collections WHERE collection_id = ?';
      
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
        FROM album_collections
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

  // Get count of albums in a collection
  getCollectionCount: (collectionId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT COUNT(*) as count FROM album_collections WHERE collection_id = ?';
      
      db.get(sql, [collectionId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });
  }
};

module.exports = AlbumCollection;

