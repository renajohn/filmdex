const { getDatabase } = require('../database');
const crypto = require('crypto');

const MovieImport = {
  createTable: () => {
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
      db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },


  create: (importData = {}) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const id = crypto.randomUUID();
      const { status = 'PENDING' } = importData;
      
      const sql = `
        INSERT INTO movie_imports (id, status, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      
      db.run(sql, [id, status], function(err) {
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

  findById: (id) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movie_imports WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  updateStatus: (id, status) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE movie_imports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      
      db.run(sql, [status, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, status, changes: this.changes });
        }
      });
    });
  },

  updateStatistics: (id, totalMovies, processedMovies, autoResolvedMovies = 0, manualResolvedMovies = 0) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE movie_imports SET total_movies = ?, processed_movies = ?, auto_resolved_movies = ?, manual_resolved_movies = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      
      db.run(sql, [totalMovies, processedMovies, autoResolvedMovies, manualResolvedMovies, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, totalMovies, processedMovies, autoResolvedMovies, manualResolvedMovies, changes: this.changes });
        }
      });
    });
  },

  updateProgress: (id, processedMovies, totalMovies) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE movie_imports SET processed_movies = ?, total_movies = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      
      db.run(sql, [processedMovies, totalMovies, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, processedMovies, totalMovies, changes: this.changes });
        }
      });
    });
  },

  findAll: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movie_imports ORDER BY created_at DESC';
      
      db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  },

  delete: (id) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_imports WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, changes: this.changes });
        }
      });
    });
  }
};

module.exports = MovieImport;
