import { getDatabase } from '../database';
import cacheService from '../services/cacheService';
import type { RunResult } from 'sqlite3';
import type { MovieRow, MovieData, MovieSearchCriteria, MovieUpdateResult, MovieWatchResult } from '../types';
import { warningStatusColumnsSql } from '../warnings/rules';
import { filmagesColumnsSql } from './movieFilmages';
import { movieSearchSql, parseMovieSearch } from './movieSearch';

const Movie = {
  createTable: (): Promise<void> => {
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
          tmdb_id INTEGER,
          imdb_id TEXT,
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
          media_type TEXT DEFAULT 'movie',
          recommended_age INTEGER,
          age_processed BOOLEAN DEFAULT 0,
          title_status TEXT DEFAULT 'owned'
        )
      `;
      db.run(sql, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          // Create unique index for multiple editions support
          db.run(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_edition_unique
            ON movies(title, tmdb_id, format)
          `, (err: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }
      });
    });
  },

  create: (movie: MovieData): Promise<MovieData & { id: number }> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const {
        title, original_title, original_language, genre, director, cast, release_date, format,
        imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
        price, runtime, plot, comments, never_seen, acquired_date, import_id,
        poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
        popularity, vote_count, adult, video, media_type = 'movie', recommended_age, age_processed = false, title_status = 'owned'
      } = movie;
      const sql = `
        INSERT INTO movies (title, original_title, original_language, genre, director, cast, release_date, format,
                           imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
                           price, runtime, plot, comments, never_seen, acquired_date, import_id,
                           poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
                           popularity, vote_count, adult, video, media_type, recommended_age, age_processed, title_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        title, original_title, original_language, genre, director, JSON.stringify(cast), release_date, format,
        imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
        price, runtime, plot, comments, never_seen, acquired_date, import_id,
        poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
        popularity, vote_count, adult, video, media_type, recommended_age, age_processed, title_status
      ], function(this: RunResult, err: Error | null) {
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
            cast: Array.isArray(cast) ? cast : (cast ? JSON.parse(cast as string) : []),
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
            media_type,
            recommended_age,
            age_processed,
            title_status
          };
          resolve(createdMovie as MovieData & { id: number });
        }
      });
    });
  },

  findAll: (): Promise<MovieData[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT m.*,
          MAX(CASE WHEN c.type = 'box_set' THEN mc.collection_order END) as collection_order,
          GROUP_CONCAT(
            CASE WHEN c.type = 'box_set'
            THEN c.id || ':' || c.name || ':' || c.type
            END
          ) as box_set_collections,
          GROUP_CONCAT(
            CASE WHEN c.type = 'user'
            THEN c.name
            END
          ) as user_collections
        FROM movies m
        LEFT JOIN movie_collections mc ON m.id = mc.movie_id
        LEFT JOIN collections c ON mc.collection_id = c.id
        GROUP BY m.id
        ORDER BY m.title
      `;
      db.all(sql, (err: Error | null, rows: MovieRow[]) => {
        if (err) {
          reject(err);
        } else {
          const movies = rows.map(row => {
            const movie: Record<string, unknown> = { ...row };

            // Parse box set collections info
            if (movie.box_set_collections && (movie.box_set_collections as string).trim() !== '') {
              const boxSetData = (movie.box_set_collections as string).split(',')[0].split(':');
              if (boxSetData.length >= 2) {
                movie.has_box_set = true;
                movie.box_set_name = boxSetData[1];
              } else {
                movie.has_box_set = false;
                movie.box_set_name = null;
              }
            } else {
              movie.has_box_set = false;
              movie.box_set_name = null;
            }
            // Remove the raw concatenated string
            delete movie.box_set_collections;

            // Parse user collections info
            if (movie.user_collections && (movie.user_collections as string).trim() !== '') {
              const collectionNames = (movie.user_collections as string).split(',').filter((name: string) => name && name.trim() !== '');
              movie.collection_names = collectionNames;
            } else {
              movie.collection_names = [];
            }
            // Remove the raw concatenated string
            delete movie.user_collections;

            return movie as unknown as MovieData;
          });
          resolve(movies);
        }
      });
    });
  },

  search: (criteria: MovieSearchCriteria): Promise<MovieData[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      let sql = `
        SELECT m.*,
          ${warningStatusColumnsSql()},
          ${filmagesColumnsSql()},
          MAX(CASE WHEN c.type = 'box_set' THEN mc.collection_order END) as collection_order,
          GROUP_CONCAT(
            CASE WHEN c.type = 'box_set'
            THEN c.id || ':' || c.name || ':' || c.type
            END
          ) as box_set_collections,
          GROUP_CONCAT(
            CASE WHEN c.type = 'user'
            THEN c.name
            END
          ) as user_collections
        FROM movies m
        LEFT JOIN movie_collections mc ON m.id = mc.movie_id
        LEFT JOIN collections c ON mc.collection_id = c.id
        WHERE 1=1
      `;
      const params: unknown[] = [];

      // Filter by title_status if specified, otherwise return owned movies by default
      if (criteria.title_status) {
        sql += ' AND m.title_status = ?';
        params.push(criteria.title_status);
      } else {
        // Only return owned movies by default (for collection search)
        sql += ' AND (m.title_status = ? OR m.title_status IS NULL)';
        params.push('owned');
      }

      // The search's filters and words (models/movieSearch.ts): -key: excludes, a,b is
      // one or the other, yes/no and the old words, numbers compared or in a range.
      if (criteria.searchText) {
        const search = movieSearchSql(parseMovieSearch(criteria.searchText));
        sql += search.sql;
        params.push(...search.params);
      }

      if (criteria.format) {
        sql += ' AND m.format = ?';
        params.push(criteria.format);
      }

      // Search by year in release_date
      if (criteria.year) {
        sql += ' AND (m.release_date LIKE ? OR strftime("%Y", m.release_date) = ?)';
        params.push(`%${criteria.year}%`, criteria.year.toString());
      }

      sql += ' GROUP BY m.id ORDER BY m.title';

      db.all(sql, params, (err: Error | null, rows: MovieRow[]) => {
        if (err) {
          reject(err);
        } else {
          const movies = rows.map(row => {
            const movie: Record<string, unknown> = { ...row };

            // Parse box set collections info
            if (movie.box_set_collections && (movie.box_set_collections as string).trim() !== '') {
              const boxSetData = (movie.box_set_collections as string).split(',')[0].split(':');
              if (boxSetData.length >= 2) {
                movie.has_box_set = true;
                movie.box_set_name = boxSetData[1];
              } else {
                movie.has_box_set = false;
                movie.box_set_name = null;
              }
            } else {
              movie.has_box_set = false;
              movie.box_set_name = null;
            }
            // Remove the raw concatenated string
            delete movie.box_set_collections;

            // Parse user collections info
            if (movie.user_collections && (movie.user_collections as string).trim() !== '') {
              const collectionNames = (movie.user_collections as string).split(',').filter((name: string) => name && name.trim() !== '');
              movie.collection_names = collectionNames;
            } else {
              movie.collection_names = [];
            }
            // Remove the raw concatenated string
            delete movie.user_collections;

            return movie as unknown as MovieData;
          });
          resolve(movies);
        }
      });
    });
  },

  getFormats: (): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `SELECT DISTINCT format FROM movies WHERE format IS NOT NULL AND format != '' ORDER BY format`;

      db.all(sql, [], (err: Error | null, rows: Array<{ format: string }>) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.format));
        }
      });
    });
  },

  findById: (id: number): Promise<MovieData | null> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT m.*
        FROM movies m
        WHERE m.id = ?
      `;

      db.get(sql, [id], (err: Error | null, row: MovieRow | undefined) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          // Map the raw database row to the expected format
          const movie: MovieData = {
            id: row.id,
            title: row.title,
            original_title: row.original_title,
            original_language: row.original_language,
            genre: row.genre,
            director: row.director,
            cast: Array.isArray(row.cast) ? row.cast : (row.cast ? JSON.parse(row.cast as string) : []),
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
            media_type: row.media_type || undefined,
            recommended_age: row.recommended_age,
            age_processed: row.age_processed || undefined,
            age_source: row.age_source ?? null,
            title_status: row.title_status || 'owned',
            last_watched: row.last_watched,
            watch_count: row.watch_count || 0
          };

          resolve(movie);
        }
      });
    });
  },

  // Mark a movie as watched (optionally increments watch_count, sets last_watched, and never_seen to false)
  // incrementCount: true = always increment, false = only increment if count was 0
  markAsWatched: (id: number, date: string | null = null, incrementCount = true): Promise<MovieWatchResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const watchDate = date || new Date().toISOString().split('T')[0];

      // If incrementCount is false, only increment if count is currently 0
      const sql = incrementCount
        ? `UPDATE movies SET last_watched = ?, never_seen = 0, watch_count = COALESCE(watch_count, 0) + 1 WHERE id = ?`
        : `UPDATE movies SET last_watched = ?, never_seen = 0, watch_count = CASE WHEN COALESCE(watch_count, 0) = 0 THEN 1 ELSE watch_count END WHERE id = ?`;

      db.run(sql, [watchDate, id], function(this: RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          const changes = this.changes;
          // Get the updated watch_count
          db.get(`SELECT watch_count FROM movies WHERE id = ?`, [id], (err: Error | null, row: { watch_count: number } | undefined) => {
            if (err) {
              reject(err);
            } else {
              resolve({
                id: id,
                last_watched: watchDate,
                watch_count: row ? row.watch_count : 1,
                never_seen: false,
                changes: changes
              });
            }
          });
        }
      });
    });
  },

  // Clear the watched date and count (reset watch history)
  clearWatched: (id: number): Promise<MovieWatchResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();

      const sql = `UPDATE movies SET last_watched = NULL, watch_count = 0 WHERE id = ?`;

      db.run(sql, [id], function(this: RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: id,
            last_watched: null,
            watch_count: 0,
            changes: this.changes
          });
        }
      });
    });
  },

  // Update watch count directly (for manual editing)
  updateWatchCount: (id: number, count: number | string): Promise<{ id: number; watch_count: number; changes: number }> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const watchCount = Math.max(0, parseInt(String(count)) || 0);

      const sql = `UPDATE movies SET watch_count = ? WHERE id = ?`;

      db.run(sql, [watchCount, id], function(this: RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: id,
            watch_count: watchCount,
            changes: this.changes
          });
        }
      });
    });
  },

  findByImdbId: (imdbId: string): Promise<MovieRow | undefined> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE imdb_id = ?';

      db.get(sql, [imdbId], (err: Error | null, row: MovieRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  findByTmdbId: (tmdbId: number): Promise<MovieRow | undefined> => {
    return new Promise((resolve, reject) => {
      try {
        const db = getDatabase();
        const sql = 'SELECT * FROM movies WHERE tmdb_id = ?';

        db.get(sql, [tmdbId], (err: Error | null, row: MovieRow | undefined) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  update: (id: number, movieData: MovieData): Promise<MovieUpdateResult> => {
    return new Promise(async (resolve, reject) => {
      try {
        const db = getDatabase();
        const {
          title, original_title, original_language, genre, director, cast, release_date, format,
          imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
          price, runtime, plot, comments, never_seen, acquired_date, import_id,
          poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
          popularity, vote_count, adult, video, media_type = 'movie', recommended_age, title_status
        } = movieData;

        const sql = `
          UPDATE movies
          SET title = ?, original_title = ?, original_language = ?, genre = ?, director = ?, cast = ?,
              release_date = ?, format = ?, imdb_rating = ?, rotten_tomato_rating = ?,
              rotten_tomatoes_link = ?, tmdb_rating = ?, tmdb_id = ?, imdb_id = ?,
              price = ?, runtime = ?, plot = ?, comments = ?, never_seen = ?, acquired_date = ?, import_id = ?,
              poster_path = ?, backdrop_path = ?, budget = ?, revenue = ?, trailer_key = ?, trailer_site = ?,
              status = ?, popularity = ?, vote_count = ?, adult = ?, video = ?, media_type = ?, recommended_age = ?, title_status = ?
          WHERE id = ?
        `;

        db.run(sql, [
          title, original_title, original_language, genre, director, JSON.stringify(cast), release_date, format,
          imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
          price, runtime, plot, comments, never_seen, acquired_date, import_id,
          poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
          popularity, vote_count, adult, video, media_type, recommended_age, title_status, id
        ], function(this: RunResult, err: Error | null) {
          if (err) {
            console.error(`[Movie.update] Error updating movie ID ${id}:`, err);
            reject(err);
          } else {
            resolve({ id: id, changes: this.changes });
          }
        });
      } catch (error) {
        console.error(`[Movie.update] Error in update process for movie ID ${id}:`, error);
        reject(error);
      }
    });
  },

  // Update only specific fields (for simplified editing)
  updateFields: (id: number, movieData: Record<string, unknown>): Promise<MovieUpdateResult> => {
    return new Promise(async (resolve, reject) => {
      try {
        const db = getDatabase();

        // Build dynamic SQL based on provided fields
        const fields: string[] = [];
        const values: unknown[] = [];

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

        db.run(sql, values, async function(this: RunResult, err: Error | null) {
          if (err) {
            reject(err);
          } else {
            // Invalidate analytics cache when movie is updated
            await cacheService.invalidateAnalytics();
            resolve({ id: id, changes: this.changes });
          }
        });
      } catch (error) {
        console.error(`[Movie.updateFields] Error in updateFields process for movie ID ${id}:`, error);
        reject(error);
      }
    });
  },

  delete: (id: number): Promise<{ id: number; changes: number }> => {
    return new Promise(async (resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movies WHERE id = ?';

      db.run(sql, [id], async function(this: RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          // Invalidate analytics cache when movie is deleted
          await cacheService.invalidateAnalytics();
          resolve({ id: id, changes: this.changes });
        }
      });
    });
  },

  deleteAll: (): Promise<{ deleted: number }> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movies';

      db.run(sql, [], function(this: RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes });
        }
      });
    });
  },

  findByTitle: (title: string): Promise<MovieRow | undefined> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE LOWER(title) = LOWER(?)';

      db.get(sql, [title], (err: Error | null, row: MovieRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  // Find all movies with the same TMDB ID (different editions)
  findAllByTmdbId: (tmdbId: number): Promise<MovieRow[]> => {
    return new Promise((resolve, reject) => {
      try {
        const db = getDatabase();
        const sql = 'SELECT * FROM movies WHERE tmdb_id = ? ORDER BY title, format';

        db.all(sql, [tmdbId], (err: Error | null, rows: MovieRow[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // Helper method to build IMDB URL from ID
  buildImdbUrl: (imdbId: string | null): string | null => {
    return imdbId ? `https://www.imdb.com/title/${imdbId}` : null;
  },

  // Helper method to build TMDB URL from ID
  buildTmdbUrl: (tmdbId: number | null): string | null => {
    return tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : null;
  },

  upsert: (movieData: MovieData): Promise<MovieData & { action: string }> => {
    return new Promise(async (resolve, reject) => {
      try {
        const existingMovie = await Movie.findByTitle(movieData.title as string);

        if (existingMovie) {
          // Update existing movie
          const updatedMovie = await Movie.update(existingMovie.id, movieData);
          resolve({ ...updatedMovie, ...movieData, action: 'updated' } as MovieData & { action: string });
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
  validateImagePaths: (movie: MovieData): MovieData => {
    const fs = require('fs');
    const path = require('path');
    const configManager = require('../config');

    try {
      const imagesPath: string = configManager.getImagesPath();
      const cleanedMovie = { ...movie };

      // Check poster_path
      if (movie.poster_path && movie.poster_path.startsWith('/images/')) {
        const localPath = path.join(imagesPath, movie.poster_path.replace('/images/', ''));
        if (!fs.existsSync(localPath)) {
          cleanedMovie.poster_path = null;
        }
      }

      // Check backdrop_path
      if (movie.backdrop_path && movie.backdrop_path.startsWith('/images/')) {
        const localPath = path.join(imagesPath, movie.backdrop_path.replace('/images/', ''));
        if (!fs.existsSync(localPath)) {
          cleanedMovie.backdrop_path = null;
        }
      }

      return cleanedMovie;
    } catch (error) {
      console.error('Error validating image paths:', error);
      return movie; // Return original if validation fails
    }
  },

  // Get movies by title_status
  findByStatus: (status: string): Promise<MovieData[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT m.*,
          ${warningStatusColumnsSql()},
          ${filmagesColumnsSql()},
          MAX(CASE WHEN c.type = 'box_set' THEN mc.collection_order END) as collection_order,
          GROUP_CONCAT(
            CASE WHEN c.type = 'box_set'
            THEN c.id || ':' || c.name || ':' || c.type
            END
          ) as box_set_collections,
          GROUP_CONCAT(
            CASE WHEN c.type = 'user'
            THEN c.name
            END
          ) as user_collections
        FROM movies m
        LEFT JOIN movie_collections mc ON m.id = mc.movie_id
        LEFT JOIN collections c ON mc.collection_id = c.id
        WHERE m.title_status = ?
        GROUP BY m.id
        ORDER BY m.title
      `;
      db.all(sql, [status], (err: Error | null, rows: MovieRow[]) => {
        if (err) {
          reject(err);
        } else {
          const movies = rows.map(row => {
            const movie: Record<string, unknown> = { ...row };
            if (movie.cast) {
              try {
                movie.cast = JSON.parse(movie.cast as string);
              } catch (e) {
                movie.cast = [];
              }
            } else {
              movie.cast = [];
            }

            // Parse box set collections info
            if (movie.box_set_collections && (movie.box_set_collections as string).trim() !== '') {
              const boxSetData = (movie.box_set_collections as string).split(',')[0].split(':');
              if (boxSetData.length >= 2) {
                movie.has_box_set = true;
                movie.box_set_name = boxSetData[1];
              } else {
                movie.has_box_set = false;
                movie.box_set_name = null;
              }
            } else {
              movie.has_box_set = false;
              movie.box_set_name = null;
            }
            // Remove the raw concatenated string
            delete movie.box_set_collections;

            // Parse user collections info
            if (movie.user_collections && (movie.user_collections as string).trim() !== '') {
              const collectionNames = (movie.user_collections as string).split(',').filter((name: string) => name && name.trim() !== '');
              movie.collection_names = collectionNames;
            } else {
              movie.collection_names = [];
            }
            // Remove the raw concatenated string
            delete movie.user_collections;

            return movie as unknown as MovieData;
          });
          resolve(movies);
        }
      });
    });
  },

  // Update title_status of a movie
  updateStatus: (id: number, status: string): Promise<{ id: number; title_status: string }> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE movies SET title_status = ? WHERE id = ?';
      db.run(sql, [status, id], function(this: RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, title_status: status });
        }
      });
    });
  },

  // Migration method to add title_status column to existing databases
  addTitleStatusColumn: (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        ALTER TABLE movies ADD COLUMN title_status TEXT DEFAULT 'owned'
      `;
      db.run(sql, (err: Error | null) => {
        if (err) {
          // Column might already exist, which is fine
          if (err.message.includes('duplicate column name')) {
            resolve();
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      });
    });
  },

  // Toggle Watch Next collection membership
  toggleWatchNext: (id: number): Promise<{ id: number }> => {
    return new Promise(async (resolve, reject) => {
      try {
        const db = getDatabase();
        const Collection = (await import('./collection')).default;
        const MovieCollection = (await import('./movieCollection')).default;

        // Get the Watch Next system collection
        const watchNextCollection = await Collection.findByType('watch_next');
        if (!watchNextCollection) {
          throw new Error('Watch Next collection not found');
        }

        // Check if movie is already in Watch Next
        const existing = await MovieCollection.findByMovieAndCollection(id, watchNextCollection.id);

        if (existing) {
          // Remove from Watch Next
          await new Promise<void>((resolve, reject) => {
            db.run('DELETE FROM movie_collections WHERE id = ?', [existing.id], function(this: RunResult, err: Error | null) {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });

          resolve({ id });
        } else {
          // Add to Watch Next at the end
          const position = await MovieCollection.getNextOrder(watchNextCollection.id);

          await MovieCollection.create({
            movie_id: id,
            collection_id: watchNextCollection.id,
            collection_order: position
          });

          resolve({ id });
        }
      } catch (error) {
        reject(error);
      }
    });
  },

};

export default Movie;
