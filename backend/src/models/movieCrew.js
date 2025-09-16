const { getDatabase } = require('../database');

const MovieCrew = {
  createTable: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS movie_crew (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          movie_id INTEGER,
          tmdb_crew_id INTEGER,
          name TEXT NOT NULL,
          job TEXT,
          department TEXT,
          profile_path TEXT,
          local_profile_path TEXT,
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

  create: (crewMember) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { 
        movie_id, tmdb_crew_id, name, job, department, profile_path, local_profile_path 
      } = crewMember;
      
      const sql = `
        INSERT INTO movie_crew (movie_id, tmdb_crew_id, name, job, department, profile_path, local_profile_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(sql, [
        movie_id, tmdb_crew_id, name, job, department, profile_path, local_profile_path
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            movie_id,
            tmdb_crew_id,
            name,
            job,
            department,
            profile_path,
            local_profile_path
          });
        }
      });
    });
  },

  findByMovieId: (movieId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movie_crew WHERE movie_id = ? ORDER BY name ASC';
      
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
      const sql = 'DELETE FROM movie_crew WHERE movie_id = ?';
      
      db.run(sql, [movieId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes });
        }
      });
    });
  },

  createMultiple: (crewMembers) => {
    return new Promise(async (resolve, reject) => {
      try {
        const results = [];
        for (const crewMember of crewMembers) {
          const result = await MovieCrew.create(crewMember);
          results.push(result);
        }
        resolve(results);
      } catch (error) {
        reject(error);
      }
    });
  }
};

module.exports = MovieCrew;
