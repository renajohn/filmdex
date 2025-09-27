const { getDatabase } = require('../database');

const Movie = {
  createTable: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS movies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          original_title TEXT,
          original_language TEXT,
          genre TEXT,
          director TEXT,
          cast TEXT,
          release_date TEXT,
          format TEXT,
          imdb_rating REAL,
          rotten_tomato_rating INTEGER,
          rotten_tomatoes_link TEXT,
          tmdb_rating REAL,
          tmdb_id INTEGER UNIQUE,
          imdb_id TEXT UNIQUE,
          price REAL,
          runtime INTEGER,
          plot TEXT,
          comments TEXT,
          never_seen BOOLEAN,
          acquired_date DATE,
          import_id TEXT,
          poster_path TEXT,
          backdrop_path TEXT,
          budget INTEGER,
          revenue INTEGER,
          trailer_key TEXT,
          trailer_site TEXT,
          status TEXT,
          popularity REAL,
          vote_count INTEGER,
          adult BOOLEAN,
          video BOOLEAN,
          media_type TEXT DEFAULT 'movie'
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

  create: (movie) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { 
        title, original_title, original_language, genre, director, cast, release_date, format, 
        imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
        price, runtime, plot, comments, never_seen, acquired_date, import_id,
        poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
        popularity, vote_count, adult, video, media_type = 'movie'
      } = movie;
      const sql = `
        INSERT INTO movies (title, original_title, original_language, genre, director, cast, release_date, format, 
                           imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
                           price, runtime, plot, comments, never_seen, acquired_date, import_id,
                           poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
                           popularity, vote_count, adult, video, media_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        title, original_title, original_language, genre, director, JSON.stringify(cast), release_date, format,
        imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
        price, runtime, plot, comments, never_seen, acquired_date, import_id,
        poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
        popularity, vote_count, adult, video, media_type
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          // Return the full movie data with the new ID
          const createdMovie = {
            id: this.lastID,
            title,
            original_title,
            original_language,
            genre,
            director,
            cast: Array.isArray(cast) ? cast : (cast ? JSON.parse(cast) : []),
            release_date,
            format,
            imdb_rating,
            rotten_tomato_rating,
            rotten_tomatoes_link,
            tmdb_rating,
            tmdb_id,
            imdb_id,
            price,
            runtime,
            plot,
            comments,
            never_seen,
            acquired_date,
            import_id,
            poster_path,
            backdrop_path,
            budget,
            revenue,
            trailer_key,
            trailer_site,
            status,
            popularity,
            vote_count,
            adult,
            video,
            media_type
          };
          resolve(createdMovie);
        }
      });
    });
  },

  findAll: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies ORDER BY title';
      db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  },

  search: (criteria) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      let sql = 'SELECT * FROM movies WHERE 1=1';
      const params = [];

      // Full-text search on title, director, and comments
      if (criteria.searchText) {
        sql += ' AND (title LIKE ? OR original_title LIKE ? OR director LIKE ? OR comments LIKE ?)';
        const searchTerm = `%${criteria.searchText}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      if (criteria.format) {
        sql += ' AND format = ?';
        params.push(criteria.format);
      }

      // Search by year in release_date
      if (criteria.year) {
        sql += ' AND (release_date LIKE ? OR strftime("%Y", release_date) = ?)';
        params.push(`%${criteria.year}%`, criteria.year.toString());
      }

      sql += ' ORDER BY title';

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  },

  getFormats: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `SELECT DISTINCT format FROM movies WHERE format IS NOT NULL AND format != '' ORDER BY format`;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.format));
        }
      });
    });
  },

  findById: (id) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          // Map the raw database row to the expected format
          const movie = {
            id: row.id,
            title: row.title,
            original_title: row.original_title,
            original_language: row.original_language,
            genre: row.genre,
            director: row.director,
            cast: Array.isArray(row.cast) ? row.cast : (row.cast ? JSON.parse(row.cast) : []),
            release_date: row.release_date,
            format: row.format,
            imdb_rating: row.imdb_rating,
            rotten_tomato_rating: row.rotten_tomato_rating,
            rotten_tomatoes_link: row.rotten_tomatoes_link,
            tmdb_rating: row.tmdb_rating,
            tmdb_id: row.tmdb_id,
            imdb_id: row.imdb_id,
            price: row.price,
            runtime: row.runtime,
            plot: row.plot,
            comments: row.comments,
            never_seen: row.never_seen,
            acquired_date: row.acquired_date,
            import_id: row.import_id,
            poster_path: row.poster_path,
            backdrop_path: row.backdrop_path,
            budget: row.budget,
            revenue: row.revenue,
            trailer_key: row.trailer_key,
            trailer_site: row.trailer_site,
            status: row.status,
            popularity: row.popularity,
            vote_count: row.vote_count,
            adult: row.adult,
            video: row.video,
            media_type: row.media_type
          };
          
          console.log('findById returning movie:', {
            id: movie.id,
            title: movie.title,
            rotten_tomato_rating: movie.rotten_tomato_rating,
            tmdb_rating: movie.tmdb_rating,
            imdb_rating: movie.imdb_rating
          });
          
          resolve(movie);
        }
      });
    });
  },

  findByImdbId: (imdbId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE imdb_id = ?';
      
      db.get(sql, [imdbId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  findByTmdbId: (tmdbId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE tmdb_id = ?';
      
      db.get(sql, [tmdbId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  update: (id, movieData) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { 
        title, original_title, original_language, genre, director, cast, release_date, format, 
        imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
        price, runtime, plot, comments, never_seen, acquired_date, import_id,
        poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
        popularity, vote_count, adult, video, media_type = 'movie'
      } = movieData;
      
      const sql = `
        UPDATE movies 
        SET title = ?, original_title = ?, original_language = ?, genre = ?, director = ?, cast = ?, 
            release_date = ?, format = ?, imdb_rating = ?, rotten_tomato_rating = ?, 
            rotten_tomatoes_link = ?, tmdb_rating = ?, tmdb_id = ?, imdb_id = ?, 
            price = ?, runtime = ?, plot = ?, comments = ?, never_seen = ?, acquired_date = ?, import_id = ?,
            poster_path = ?, backdrop_path = ?, budget = ?, revenue = ?, trailer_key = ?, trailer_site = ?,
            status = ?, popularity = ?, vote_count = ?, adult = ?, video = ?, media_type = ?
        WHERE id = ?
      `;
      
      db.run(sql, [
        title, original_title, original_language, genre, director, JSON.stringify(cast), release_date, format,
        imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
        price, runtime, plot, comments, never_seen, acquired_date, import_id,
        poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
        popularity, vote_count, adult, video, media_type, id
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: id, changes: this.changes });
        }
      });
    });
  },

  // Update only specific fields (for simplified editing)
  updateFields: (id, movieData) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      
      // Build dynamic SQL based on provided fields
      const fields = [];
      const values = [];
      
      Object.keys(movieData).forEach(key => {
        if (movieData[key] !== undefined) {
          if (key === 'cast' && Array.isArray(movieData[key])) {
            fields.push(`${key} = ?`);
            values.push(JSON.stringify(movieData[key]));
          } else {
            fields.push(`${key} = ?`);
            values.push(movieData[key]);
          }
        }
      });
      
      if (fields.length === 0) {
        resolve({ id: id, changes: 0 });
        return;
      }
      
      values.push(id);
      const sql = `UPDATE movies SET ${fields.join(', ')} WHERE id = ?`;
      
      db.run(sql, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: id, changes: this.changes });
        }
      });
    });
  },

  delete: (id) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movies WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: id, changes: this.changes });
        }
      });
    });
  },

  deleteAll: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movies';
      
      db.run(sql, [], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes });
        }
      });
    });
  },

  findByTitle: (title) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE LOWER(title) = LOWER(?)';
      
      db.get(sql, [title], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  findByTmdbId: (tmdbId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE tmdb_id = ?';
      
      db.get(sql, [tmdbId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  findByImdbId: (imdbId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE imdb_id = ?';
      
      db.get(sql, [imdbId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  // Helper method to build IMDB URL from ID
  buildImdbUrl: (imdbId) => {
    return imdbId ? `https://www.imdb.com/title/${imdbId}` : null;
  },

  // Helper method to build TMDB URL from ID
  buildTmdbUrl: (tmdbId) => {
    return tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : null;
  },

  upsert: (movieData) => {
    return new Promise(async (resolve, reject) => {
      try {
        const existingMovie = await Movie.findByTitle(movieData.title);
        
        if (existingMovie) {
          // Update existing movie
          const updatedMovie = await Movie.update(existingMovie.id, movieData);
          resolve({ ...updatedMovie, action: 'updated' });
        } else {
          // Create new movie
          const newMovie = await Movie.create(movieData);
          resolve({ ...newMovie, action: 'created' });
        }
      } catch (error) {
        reject(error);
      }
    });
  },

  // Validate and clean up image paths
  validateImagePaths: (movie) => {
    const fs = require('fs');
    const path = require('path');
    const configManager = require('../config');
    
    try {
      const imagesPath = configManager.getImagesPath();
      let cleanedMovie = { ...movie };
      
      // Check poster_path
      if (movie.poster_path && movie.poster_path.startsWith('/images/')) {
        const localPath = path.join(imagesPath, movie.poster_path.replace('/images/', ''));
        if (!fs.existsSync(localPath)) {
          console.log(`Poster image not found: ${movie.poster_path}, setting to null`);
          cleanedMovie.poster_path = null;
        }
      }
      
      // Check backdrop_path
      if (movie.backdrop_path && movie.backdrop_path.startsWith('/images/')) {
        const localPath = path.join(imagesPath, movie.backdrop_path.replace('/images/', ''));
        if (!fs.existsSync(localPath)) {
          console.log(`Backdrop image not found: ${movie.backdrop_path}, setting to null`);
          cleanedMovie.backdrop_path = null;
        }
      }
      
      return cleanedMovie;
    } catch (error) {
      console.error('Error validating image paths:', error);
      return movie; // Return original if validation fails
    }
  },

};

module.exports = Movie;
