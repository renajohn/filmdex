import type sqlite3 from 'sqlite3';
import { getDatabase } from '../database';
import type { MovieCollectionRow, MovieCollectionData } from '../types';

interface MovieCollectionCreateResult {
  id: number;
  movie_id: number;
  collection_id: number;
  collection_order: number | null;
  created_at: string;
}

interface MovieCollectionOrderResult {
  movieId: number;
  collectionId: number;
  collectionOrder: number | null;
  changes: number;
}

interface MovieCollectionDeleteResult {
  movieId: number;
  collectionId: number;
  changes: number;
}

interface MovieCollectionDeleteByMovieResult {
  movieId: number;
  changes: number;
}

interface MovieCollectionDeleteByCollectionResult {
  collectionId: number;
  changes: number;
}

interface MaxOrderRow {
  max_order: number | null;
}

interface CountRow {
  count: number;
}

const MovieCollection = {
  createTable: (): Promise<void> => {
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
      db.run(sql, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  create: (movieCollectionData: MovieCollectionData): Promise<MovieCollectionCreateResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { movie_id, collection_id, collection_order } = movieCollectionData;

      const sql = `
        INSERT INTO movie_collections (movie_id, collection_id, collection_order, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `;

      db.run(sql, [movie_id, collection_id, collection_order], function(this: sqlite3.RunResult, err: Error | null) {
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

  findByMovieId: (movieId: number): Promise<MovieCollectionRow[]> => {
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

      db.all(sql, [movieId], (err: Error | null, rows: MovieCollectionRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  findByCollectionId: (collectionId: number): Promise<MovieCollectionRow[]> => {
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

      db.all(sql, [collectionId], (err: Error | null, rows: MovieCollectionRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  findByMovieAndCollection: (movieId: number, collectionId: number): Promise<MovieCollectionRow | undefined> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movie_collections WHERE movie_id = ? AND collection_id = ?';

      db.get(sql, [movieId, collectionId], (err: Error | null, row: MovieCollectionRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  updateOrder: (movieId: number, collectionId: number, collectionOrder: number | null): Promise<MovieCollectionOrderResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        UPDATE movie_collections
        SET collection_order = ?
        WHERE movie_id = ? AND collection_id = ?
      `;

      db.run(sql, [collectionOrder, movieId, collectionId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ movieId, collectionId, collectionOrder, changes: this.changes });
        }
      });
    });
  },

  delete: (movieId: number, collectionId: number): Promise<MovieCollectionDeleteResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_collections WHERE movie_id = ? AND collection_id = ?';

      db.run(sql, [movieId, collectionId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ movieId, collectionId, changes: this.changes });
        }
      });
    });
  },

  deleteByMovieId: (movieId: number): Promise<MovieCollectionDeleteByMovieResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_collections WHERE movie_id = ?';

      db.run(sql, [movieId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ movieId, changes: this.changes });
        }
      });
    });
  },

  deleteByCollectionId: (collectionId: number): Promise<MovieCollectionDeleteByCollectionResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_collections WHERE collection_id = ?';

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
        FROM movie_collections
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

  // Bulk update movie collections
  updateMovieCollections: (movieId: number, collectionNames: string[]): Promise<MovieCollectionCreateResult[]> => {
    return new Promise(async (resolve, reject) => {
      try {
        const db = getDatabase();

        // Start transaction
        db.run('BEGIN TRANSACTION');

        try {
          // Remove all existing collections for this movie
          await MovieCollection.deleteByMovieId(movieId);

          // Add new collections
          const Collection = (await import('./collection')).default;
          const results: MovieCollectionCreateResult[] = [];

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
  },

  // Get count of movies in a collection
  getCollectionCount: (collectionId: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT COUNT(*) as count FROM movie_collections WHERE collection_id = ?';

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

export default MovieCollection;
