import type sqlite3 from 'sqlite3';
import { getDatabase } from '../database';
import type { MovieCastRow, MovieCastData } from '../types';

interface MovieCastCreateResult {
  id: number;
  movie_id: number;
  tmdb_cast_id: number;
  name: string;
  character: string | null | undefined;
  profile_path: string | null | undefined;
  local_profile_path: string | null | undefined;
  order_index: number | null | undefined;
}

interface MovieCastDeleteResult {
  deleted: number;
}

const MovieCast = {
  createTable: (): Promise<void> => {
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
      db.run(sql, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  create: (castMember: MovieCastData): Promise<MovieCastCreateResult> => {
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
      ], function(this: sqlite3.RunResult, err: Error | null) {
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

  findByMovieId: (movieId: number): Promise<MovieCastRow[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movie_cast WHERE movie_id = ? ORDER BY order_index ASC';

      db.all(sql, [movieId], (err: Error | null, rows: MovieCastRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  },

  deleteByMovieId: (movieId: number): Promise<MovieCastDeleteResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_cast WHERE movie_id = ?';

      db.run(sql, [movieId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes });
        }
      });
    });
  },

  createMultiple: (castMembers: MovieCastData[]): Promise<MovieCastCreateResult[]> => {
    return new Promise(async (resolve, reject) => {
      try {
        const results: MovieCastCreateResult[] = [];
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

export default MovieCast;
