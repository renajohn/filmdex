import type sqlite3 from 'sqlite3';
import crypto from 'crypto';
import { getDatabase } from '../database';
import type { MovieImportRow } from '../types';

interface MovieImportCreateData {
  status?: string;
}

interface MovieImportCreateResult {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface MovieImportUpdateStatusResult {
  id: string;
  status: string;
  changes: number;
}

interface MovieImportUpdateStatisticsResult {
  id: string;
  totalMovies: number;
  processedMovies: number;
  autoResolvedMovies: number;
  manualResolvedMovies: number;
  changes: number;
}

interface MovieImportUpdateProgressResult {
  id: string;
  processedMovies: number;
  totalMovies: number;
  changes: number;
}

interface MovieImportDeleteResult {
  id: string;
  changes: number;
}

const MovieImport = {
  createTable: (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS movie_imports (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'PENDING',
          total_movies INTEGER DEFAULT 0,
          processed_movies INTEGER DEFAULT 0,
          auto_resolved_movies INTEGER DEFAULT 0,
          manual_resolved_movies INTEGER DEFAULT 0,
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


  create: (importData: MovieImportCreateData = {}): Promise<MovieImportCreateResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const id = crypto.randomUUID();
      const { status = 'PENDING' } = importData;

      const sql = `
        INSERT INTO movie_imports (id, status, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      db.run(sql, [id, status], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id,
            status,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      });
    });
  },

  findById: (id: string): Promise<MovieImportRow | undefined> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movie_imports WHERE id = ?';

      db.get(sql, [id], (err: Error | null, row: MovieImportRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  updateStatus: (id: string, status: string): Promise<MovieImportUpdateStatusResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE movie_imports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';

      db.run(sql, [status, id], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, status, changes: this.changes });
        }
      });
    });
  },

  updateStatistics: (id: string, totalMovies: number, processedMovies: number, autoResolvedMovies: number = 0, manualResolvedMovies: number = 0): Promise<MovieImportUpdateStatisticsResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE movie_imports SET total_movies = ?, processed_movies = ?, auto_resolved_movies = ?, manual_resolved_movies = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';

      db.run(sql, [totalMovies, processedMovies, autoResolvedMovies, manualResolvedMovies, id], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, totalMovies, processedMovies, autoResolvedMovies, manualResolvedMovies, changes: this.changes });
        }
      });
    });
  },

  updateProgress: (id: string, processedMovies: number, totalMovies: number): Promise<MovieImportUpdateProgressResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE movie_imports SET processed_movies = ?, total_movies = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';

      db.run(sql, [processedMovies, totalMovies, id], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, processedMovies, totalMovies, changes: this.changes });
        }
      });
    });
  },

  findAll: (): Promise<MovieImportRow[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movie_imports ORDER BY created_at DESC';

      db.all(sql, (err: Error | null, rows: MovieImportRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  },

  delete: (id: string): Promise<MovieImportDeleteResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_imports WHERE id = ?';

      db.run(sql, [id], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, changes: this.changes });
        }
      });
    });
  }
};

export default MovieImport;
