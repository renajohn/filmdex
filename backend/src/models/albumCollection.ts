import type sqlite3 from 'sqlite3';
import { getDatabase } from '../database';
import type { AlbumCollectionRow, AlbumCollectionData } from '../types';

interface AlbumCollectionCreateResult {
  id: number;
  album_id: number;
  collection_id: number;
  collection_order: number | null;
  created_at: string;
}

interface AlbumCollectionOrderResult {
  albumId: number;
  collectionId: number;
  collectionOrder: number | null;
  changes: number;
}

interface AlbumCollectionDeleteResult {
  albumId: number;
  collectionId: number;
  changes: number;
}

interface AlbumCollectionDeleteByAlbumResult {
  albumId: number;
  changes: number;
}

interface AlbumCollectionDeleteByCollectionResult {
  collectionId: number;
  changes: number;
}

interface MaxOrderRow {
  max_order: number | null;
}

interface CountRow {
  count: number;
}

const AlbumCollection = {
  createTable: (): Promise<void> => {
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
      db.run(sql, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  create: (albumCollectionData: AlbumCollectionData): Promise<AlbumCollectionCreateResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { album_id, collection_id, collection_order } = albumCollectionData;

      const sql = `
        INSERT INTO album_collections (album_id, collection_id, collection_order, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `;

      db.run(sql, [album_id, collection_id, collection_order], function(this: sqlite3.RunResult, err: Error | null) {
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

  findByAlbumId: (albumId: number): Promise<AlbumCollectionRow[]> => {
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

      db.all(sql, [albumId], (err: Error | null, rows: AlbumCollectionRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  findByCollectionId: (collectionId: number): Promise<AlbumCollectionRow[]> => {
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

      db.all(sql, [collectionId], (err: Error | null, rows: AlbumCollectionRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  findByAlbumAndCollection: (albumId: number, collectionId: number): Promise<AlbumCollectionRow | undefined> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM album_collections WHERE album_id = ? AND collection_id = ?';

      db.get(sql, [albumId, collectionId], (err: Error | null, row: AlbumCollectionRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  updateOrder: (albumId: number, collectionId: number, collectionOrder: number | null): Promise<AlbumCollectionOrderResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        UPDATE album_collections
        SET collection_order = ?
        WHERE album_id = ? AND collection_id = ?
      `;

      db.run(sql, [collectionOrder, albumId, collectionId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ albumId, collectionId, collectionOrder, changes: this.changes });
        }
      });
    });
  },

  delete: (albumId: number, collectionId: number): Promise<AlbumCollectionDeleteResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM album_collections WHERE album_id = ? AND collection_id = ?';

      db.run(sql, [albumId, collectionId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ albumId, collectionId, changes: this.changes });
        }
      });
    });
  },

  deleteByAlbumId: (albumId: number): Promise<AlbumCollectionDeleteByAlbumResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM album_collections WHERE album_id = ?';

      db.run(sql, [albumId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ albumId, changes: this.changes });
        }
      });
    });
  },

  deleteByCollectionId: (collectionId: number): Promise<AlbumCollectionDeleteByCollectionResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM album_collections WHERE collection_id = ?';

      db.run(sql, [collectionId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ collectionId, changes: this.changes });
        }
      });
    });
  },

  // Get the next order number for a collection
  getNextOrder: (collectionId: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT MAX(collection_order) as max_order
        FROM album_collections
        WHERE collection_id = ? AND collection_order IS NOT NULL
      `;

      db.get(sql, [collectionId], (err: Error | null, row: MaxOrderRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve((row!.max_order || 0) + 1);
        }
      });
    });
  },

  // Get count of albums in a collection
  getCollectionCount: (collectionId: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT COUNT(*) as count FROM album_collections WHERE collection_id = ?';

      db.get(sql, [collectionId], (err: Error | null, row: CountRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row!.count);
        }
      });
    });
  }
};

export default AlbumCollection;
