import type sqlite3 from 'sqlite3';
import crypto from 'crypto';
import { getDatabase } from '../database';
import type { UnmatchedMovieData, UnmatchedMovieFormatted } from '../types';

interface UnmatchedMovieRow {
  id: string;
  import_id: string;
  title: string;
  original_title: string | null;
  csv_data: string;
  error_message: string | null;
  created_at: string;
}

interface UnmatchedMovieDeleteResult {
  changes: number;
}

class UnmatchedMovie {
  static async createTable(): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS unmatched_movies (
          id TEXT PRIMARY KEY,
          import_id TEXT NOT NULL,
          title TEXT NOT NULL,
          original_title TEXT,
          csv_data TEXT NOT NULL,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (import_id) REFERENCES movie_imports (id)
        )
      `;

      db.run(sql, (err: Error | null) => {
        if (err) {
          console.error('Error creating unmatched_movies table:', err.message);
          reject(err);
        } else {
          console.log('unmatched_movies table created successfully');
          resolve();
        }
      });
    });
  }

  static async create(unmatchedMovieData: UnmatchedMovieData): Promise<UnmatchedMovieData & { id: string }> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const id = crypto.randomUUID();
      const { import_id, title, original_title, csv_data, error_message } = unmatchedMovieData;

      const sql = `
        INSERT INTO unmatched_movies (id, import_id, title, original_title, csv_data, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const params = [id, import_id, title, original_title, JSON.stringify(csv_data), error_message];

      db.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          console.error('Error creating unmatched movie:', err.message);
          reject(err);
        } else {
          resolve({ id, ...unmatchedMovieData });
        }
      });
    });
  }

  static async findByImportId(importId: string): Promise<UnmatchedMovieFormatted[]> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM unmatched_movies WHERE import_id = ? ORDER BY created_at ASC';

      db.all(sql, [importId], (err: Error | null, rows: UnmatchedMovieRow[]) => {
        if (err) {
          console.error('Error finding unmatched movies by import ID:', err.message);
          reject(err);
        } else {
          const unmatchedMovies: UnmatchedMovieFormatted[] = rows.map(row => ({
            id: row.id,
            import_id: row.import_id,
            title: row.title,
            original_title: row.original_title,
            csvData: JSON.parse(row.csv_data) as Record<string, unknown>,
            error: row.error_message
          }));
          resolve(unmatchedMovies);
        }
      });
    });
  }

  static async deleteById(id: string): Promise<UnmatchedMovieDeleteResult> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM unmatched_movies WHERE id = ?';

      db.run(sql, [id], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          console.error('Error deleting unmatched movie:', err.message);
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  static async deleteByImportId(importId: string): Promise<UnmatchedMovieDeleteResult> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM unmatched_movies WHERE import_id = ?';

      db.run(sql, [importId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          console.error('Error deleting unmatched movies by import ID:', err.message);
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }
}

export default UnmatchedMovie;
