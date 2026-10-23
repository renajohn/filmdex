import { getDatabase } from '../database';
import type { FilmagesElement, FilmagesFilm } from '../services/filmagesService';

export type FilmagesMatchedBy = 'auto' | 'manual';

export interface FilmagesRecord {
  movie_id: number;
  filmages_id: number | null;
  age_legal: number | null;
  age_suggested: number | null;
  indications: FilmagesElement[];
  counter_indications: FilmagesElement[];
  synthesis: string | null;
  matched_by: FilmagesMatchedBy | null;
  checked_at: string | null;
}

type Row = Omit<FilmagesRecord, 'indications' | 'counter_indications'> & {
  indications: string | null;
  counter_indications: string | null;
};

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) =>
    getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const get = <T>(sql: string, params: unknown[] = []): Promise<T | null> =>
  new Promise((resolve, reject) =>
    getDatabase().get(sql, params, (err: Error | null, row: T | undefined) => (err ? reject(err) : resolve(row ?? null))));

const parseList = (value: string | null): FilmagesElement[] => {
  try {
    const list = value ? JSON.parse(value) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
};

const labelsSql = (column: string): string =>
  `(SELECT group_concat(json_extract(e.value, '$.label'), ' · ')
    FROM movie_filmages f, json_each(f.${column}) e WHERE f.movie_id = m.id)`;

/** A movie list's FilmAges columns, for the age tag's tooltip on a cover (movies aliased m). */
export const filmagesColumnsSql = (): string => [
  `(SELECT f.age_legal FROM movie_filmages f WHERE f.movie_id = m.id) AS filmages_age_legal`,
  `(SELECT f.age_suggested FROM movie_filmages f WHERE f.movie_id = m.id) AS filmages_age_suggested`,
  `${labelsSql('indications')} AS filmages_for`,
  `${labelsSql('counter_indications')} AS filmages_against`,
].join(',\n');

const MovieFilmages = {
  createTable: async (): Promise<void> => {
    await run(`
      CREATE TABLE IF NOT EXISTS movie_filmages (
        movie_id            INTEGER PRIMARY KEY REFERENCES movies(id) ON DELETE CASCADE,
        filmages_id         INTEGER,
        age_legal           INTEGER,
        age_suggested       INTEGER,
        indications         TEXT,
        counter_indications TEXT,
        synthesis           TEXT,
        matched_by          TEXT,
        checked_at          TEXT
      )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_movie_filmages_checked ON movie_filmages(checked_at)`);
  },

  get: async (movieId: number): Promise<FilmagesRecord | null> => {
    const row = await get<Row>(`SELECT * FROM movie_filmages WHERE movie_id = ?`, [movieId]);
    return row && {
      ...row,
      indications: parseList(row.indications),
      counter_indications: parseList(row.counter_indications),
    };
  },

  /** A manual link always wins; a search's answer leaves an existing manual link alone. */
  save: (movieId: number, film: FilmagesFilm | null, matchedBy: FilmagesMatchedBy | null, checkedAt: string): Promise<void> =>
    run(
      `INSERT INTO movie_filmages
         (movie_id, filmages_id, age_legal, age_suggested, indications, counter_indications, synthesis, matched_by, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(movie_id) DO UPDATE SET
         filmages_id = excluded.filmages_id, age_legal = excluded.age_legal,
         age_suggested = excluded.age_suggested, indications = excluded.indications,
         counter_indications = excluded.counter_indications, synthesis = excluded.synthesis,
         matched_by = excluded.matched_by, checked_at = excluded.checked_at
       WHERE excluded.matched_by = 'manual' OR movie_filmages.matched_by IS NOT 'manual'`,
      [
        movieId, film?.id ?? null, film?.ageLegal ?? null, film?.ageSuggested ?? null,
        film ? JSON.stringify(film.indications) : null,
        film ? JSON.stringify(film.counterIndications) : null,
        film?.synthesis ?? null, matchedBy, checkedAt,
      ]
    ),

  remove: (movieId: number): Promise<void> => run(`DELETE FROM movie_filmages WHERE movie_id = ?`, [movieId]),

  /**
   * Movies never looked up first, then those FilmAges did not know when last asked
   * (a film is rated when it reaches the cinemas). A film found is never asked again.
   */
  listDue: (notFoundBefore: string, limit: number): Promise<number[]> =>
    all<{ id: number }>(
      `SELECT m.id FROM movies m
       LEFT JOIN movie_filmages f ON f.movie_id = m.id
       WHERE COALESCE(m.media_type, 'movie') = 'movie'
         AND (f.movie_id IS NULL OR (f.filmages_id IS NULL AND f.matched_by IS NOT 'manual' AND f.checked_at < ?))
       ORDER BY f.movie_id IS NOT NULL, m.id
       LIMIT ?`,
      [notFoundBefore, limit]
    ).then(rows => rows.map(r => r.id)),
};

export default MovieFilmages;
