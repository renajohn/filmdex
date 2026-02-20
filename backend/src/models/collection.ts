import type sqlite3 from 'sqlite3';
import { getDatabase } from '../database';
import type { CollectionRow, CollectionData, MovieRow, AlbumFormatted } from '../types';

interface CollectionCreateResult {
  id: number;
  name: string;
  type: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

interface CollectionUpdateResult {
  id: number;
  name: string;
  changes: number;
}

interface CollectionDeleteResult {
  id: number;
  changes: number;
}

interface CountRow {
  count: number;
}

interface NameRow {
  name: string;
}

const Collection = {
  createTable: (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS collections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          type TEXT DEFAULT 'user',
          is_system BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  create: (collectionData: CollectionData): Promise<CollectionCreateResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { name, type = 'user', is_system = false } = collectionData;

      const sql = `
        INSERT INTO collections (name, type, is_system, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      db.run(sql, [name, type, is_system ? 1 : 0], function(this: sqlite3.RunResult, err: Error | null) {
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

  findByName: (name: string): Promise<CollectionRow | undefined> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM collections WHERE name = ?';

      db.get(sql, [name], (err: Error | null, row: CollectionRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  findById: (id: number): Promise<CollectionRow | undefined> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM collections WHERE id = ?';

      db.get(sql, [id], (err: Error | null, row: CollectionRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  getAll: (): Promise<CollectionRow[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM collections ORDER BY name ASC';

      db.all(sql, [], (err: Error | null, rows: CollectionRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  getSuggestions: (query: string = ''): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT DISTINCT name
        FROM collections
        WHERE name LIKE ?
        ORDER BY name ASC
        LIMIT 10
      `;

      db.all(sql, [`%${query}%`], (err: Error | null, rows: NameRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.name));
        }
      });
    });
  },

  update: (id: number, collectionData: CollectionData): Promise<CollectionUpdateResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { name } = collectionData;

      const sql = `
        UPDATE collections
        SET name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      db.run(sql, [name, id], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, name, changes: this.changes });
        }
      });
    });
  },

  delete: (id: number): Promise<CollectionDeleteResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM collections WHERE id = ?';

      db.run(sql, [id], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, changes: this.changes });
        }
      });
    });
  },

  // Auto-create collection if it doesn't exist
  findOrCreate: (name: string): Promise<CollectionRow | CollectionCreateResult> => {
    return new Promise(async (resolve, reject) => {
      try {
        // First try to find existing collection
        let collection: CollectionRow | CollectionCreateResult | undefined = await Collection.findByName(name);

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
  getMovies: (collectionId: number): Promise<(MovieRow & { collection_order: number | null })[]> => {
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

      db.all(sql, [collectionId], (err: Error | null, rows: (MovieRow & { collection_order: number | null })[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  // Get albums in a collection
  getAlbums: (collectionId: number): Promise<AlbumFormatted[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT a.*, ac.collection_order
        FROM albums a
        JOIN album_collections ac ON a.id = ac.album_id
        WHERE ac.collection_id = ?
        ORDER BY
          CASE WHEN ac.collection_order IS NOT NULL THEN ac.collection_order ELSE 999999 END,
          a.release_year ASC,
          a.title ASC
      `;

      db.all(sql, [collectionId], async (err: Error | null, rows: import('../types').AlbumRow[]) => {
        if (err) {
          reject(err);
        } else {
          const Album = (await import('./album')).default;
          resolve((rows || []).map(Album.formatRow).filter((r: AlbumFormatted | null): r is AlbumFormatted => r !== null));
        }
      });
    });
  },

  // Get collection count for a movie
  getMovieCollectionCount: (movieId: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT COUNT(*) as count
        FROM movie_collections
        WHERE movie_id = ?
      `;

      db.get(sql, [movieId], (err: Error | null, row: CountRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row!.count);
        }
      });
    });
  },

  // Check if collection is empty
  isEmpty: (collectionId: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT COUNT(*) as count
        FROM movie_collections
        WHERE collection_id = ?
      `;

      db.get(sql, [collectionId], (err: Error | null, row: CountRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row!.count === 0);
        }
      });
    });
  },

  // Find collection by type
  findByType: (type: string): Promise<CollectionRow | undefined> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM collections WHERE type = ?';

      db.get(sql, [type], (err: Error | null, row: CollectionRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  // Initialize system collections
  initializeSystemCollections: (): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        const db = getDatabase();

        // Create Watch Next system collection if it doesn't exist
        await new Promise<void>((resolve, reject) => {
          db.run(`
            INSERT OR IGNORE INTO collections (name, type, is_system, created_at, updated_at)
            VALUES ('Watch Next', 'watch_next', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, (err: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });

        // Create Listen Next system collection if it doesn't exist
        await new Promise<void>((resolve, reject) => {
          db.run(`
            INSERT OR IGNORE INTO collections (name, type, is_system, created_at, updated_at)
            VALUES ('Listen Next', 'listen_next', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, (err: Error | null) => {
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

export default Collection;
