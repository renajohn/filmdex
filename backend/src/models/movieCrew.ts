import type sqlite3 from 'sqlite3';
import { getDatabase } from '../database';
import type { MovieCrewRow, MovieCrewData } from '../types';

interface MovieCrewCreateResult {
  id: number;
  movie_id: number;
  tmdb_crew_id: number;
  name: string;
  job: string | null | undefined;
  department: string | null | undefined;
  profile_path: string | null | undefined;
  local_profile_path: string | null | undefined;
}

interface MovieCrewDeleteResult {
  deleted: number;
}

const MovieCrew = {
  createTable: (): Promise<void> => {
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
      db.run(sql, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  create: (crewMember: MovieCrewData): Promise<MovieCrewCreateResult> => {
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
      ], function(this: sqlite3.RunResult, err: Error | null) {
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

  findByMovieId: (movieId: number): Promise<MovieCrewRow[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movie_crew WHERE movie_id = ? ORDER BY name ASC';

      db.all(sql, [movieId], (err: Error | null, rows: MovieCrewRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  },

  deleteByMovieId: (movieId: number): Promise<MovieCrewDeleteResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movie_crew WHERE movie_id = ?';

      db.run(sql, [movieId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes });
        }
      });
    });
  },

  createMultiple: (crewMembers: MovieCrewData[]): Promise<MovieCrewCreateResult[]> => {
    return new Promise(async (resolve, reject) => {
      try {
        const results: MovieCrewCreateResult[] = [];
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

export default MovieCrew;
