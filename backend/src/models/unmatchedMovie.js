const sqlite3 = require('sqlite3').verbose();
const { getDatabase } = require('../database');

class UnmatchedMovie {
  static async createTable() {
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
      
      db.run(sql, (err) => {
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

  static async create(unmatchedMovieData) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const id = require('crypto').randomUUID();
      const { import_id, title, original_title, csv_data, error_message } = unmatchedMovieData;
      
      const sql = `
        INSERT INTO unmatched_movies (id, import_id, title, original_title, csv_data, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const params = [id, import_id, title, original_title, JSON.stringify(csv_data), error_message];
      
      db.run(sql, params, function(err) {
        if (err) {
          console.error('Error creating unmatched movie:', err.message);
          reject(err);
        } else {
          resolve({ id, ...unmatchedMovieData });
        }
      });
    });
  }

  static async findByImportId(importId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM unmatched_movies WHERE import_id = ? ORDER BY created_at ASC';
      
      db.all(sql, [importId], (err, rows) => {
        if (err) {
          console.error('Error finding unmatched movies by import ID:', err.message);
          reject(err);
        } else {
          const unmatchedMovies = rows.map(row => ({
            id: row.id,
            import_id: row.import_id,
            title: row.title,
            original_title: row.original_title,
            csvData: JSON.parse(row.csv_data),
            error: row.error_message
          }));
          resolve(unmatchedMovies);
        }
      });
    });
  }

  static async deleteById(id) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM unmatched_movies WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          console.error('Error deleting unmatched movie:', err.message);
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  static async deleteByImportId(importId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM unmatched_movies WHERE import_id = ?';
      
      db.run(sql, [importId], function(err) {
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

module.exports = UnmatchedMovie;
