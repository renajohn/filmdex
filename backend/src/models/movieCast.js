const { getDatabase } = require('../database');

const MovieCast = {
  createTable: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS movie_cast (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          movie_id INTEGER,
          tmdb_cast_id INTEGER,
          name TEXT NOT NULL,
          character TEXT,
          profile_path TEXT,
          local_profile_path TEXT,
          order_index INTEGER,
          FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE
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

  create: (castMember) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { 
        movie_id, tmdb_cast_id, name, character, profile_path, local_profile_path, order_index 
      } = castMember;
      
      const sql = `
        INSERT INTO movie_cast (movie_id, tmdb_cast_id, name, character, profile_path, local_profile_path, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(sql, [
        movie_id, tmdb_cast_id, name, character, profile_path, local_profile_path, order_index
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            movie_id,
            tmdb_cast_id,
            name,
            character,
            profile_path,
            local_profile_path,
            order_index
          });
        }
      });
    });
  },

  findByMovieId: (movieId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movie_cast WHERE movie_id = ? ORDER BY order_index ASC';
      
      db.all(sql, [movieId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  },

  deleteByMovieId: (movieId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_cast WHERE movie_id = ?';
      
      db.run(sql, [movieId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes });
        }
      });
    });
  },

  createMultiple: (castMembers) => {
    return new Promise(async (resolve, reject) => {
      try {
        const results = [];
        for (const castMember of castMembers) {
          const result = await MovieCast.create(castMember);
          results.push(result);
        }
        resolve(results);
      } catch (error) {
        reject(error);
      }
    });
  }
};

module.exports = MovieCast;
