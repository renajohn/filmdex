import { getDatabase } from '../database';
import type { Override, Topic } from '../warnings/rules';

export type MatchedBy = 'imdb' | 'tmdb' | 'title_year' | 'manual';

export interface DddLinkRow {
  movie_id: number;
  ddd_id: number | null;
  matched_by: MatchedBy | null;
  checked_at: string | null;
}

export interface WarningRow {
  movie_id: number;
  topic: Topic;
  yes_votes: number;
  no_votes: number;
  override: Override | null;
  override_at: string | null;
  fetched_at: string | null;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) =>
    getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const get = <T>(sql: string, params: unknown[] = []): Promise<T | null> =>
  new Promise((resolve, reject) =>
    getDatabase().get(sql, params, (err: Error | null, row: T | undefined) => (err ? reject(err) : resolve(row ?? null))));

const MovieWarning = {
  createTable: async (): Promise<void> => {
    await run(`
      CREATE TABLE IF NOT EXISTS movie_ddd (
        movie_id   INTEGER PRIMARY KEY REFERENCES movies(id) ON DELETE CASCADE,
        ddd_id     INTEGER,
        matched_by TEXT,
        checked_at TEXT
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS movie_warnings (
        movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
        topic       TEXT    NOT NULL,
        yes_votes   INTEGER NOT NULL DEFAULT 0,
        no_votes    INTEGER NOT NULL DEFAULT 0,
        override    TEXT,
        override_at TEXT,
        fetched_at  TEXT,
        PRIMARY KEY (movie_id, topic)
      )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_movie_ddd_checked ON movie_ddd(checked_at)`);
  },

  getLink: (movieId: number): Promise<DddLinkRow | null> =>
    get<DddLinkRow>(`SELECT movie_id, ddd_id, matched_by, checked_at FROM movie_ddd WHERE movie_id = ?`, [movieId]),

  saveLink: (movieId: number, dddId: number | null, matchedBy: MatchedBy | null, checkedAt: string | null): Promise<void> =>
    run(
      `INSERT INTO movie_ddd (movie_id, ddd_id, matched_by, checked_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(movie_id) DO UPDATE SET
         ddd_id = excluded.ddd_id, matched_by = excluded.matched_by, checked_at = excluded.checked_at`,
      [movieId, dddId, matchedBy, checkedAt]
    ),

  getWarnings: (movieId: number): Promise<WarningRow[]> =>
    all<WarningRow>(
      `SELECT movie_id, topic, yes_votes, no_votes, override, override_at, fetched_at
       FROM movie_warnings WHERE movie_id = ? ORDER BY topic`,
      [movieId]
    ),

  saveVotes: (movieId: number, topic: Topic, yes: number, no: number, fetchedAt: string): Promise<void> =>
    run(
      `INSERT INTO movie_warnings (movie_id, topic, yes_votes, no_votes, fetched_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(movie_id, topic) DO UPDATE SET
         yes_votes = excluded.yes_votes, no_votes = excluded.no_votes, fetched_at = excluded.fetched_at`,
      [movieId, topic, yes, no, fetchedAt]
    ),

  setOverride: (movieId: number, topic: Topic, override: Override | null, at: string): Promise<void> =>
    run(
      `INSERT INTO movie_warnings (movie_id, topic, override, override_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(movie_id, topic) DO UPDATE SET
         override = excluded.override, override_at = excluded.override_at`,
      [movieId, topic, override, at]
    ),

  /** Movies never checked first, then the oldest checks. */
  listDueForRefresh: async (checkedBefore: string, limit: number): Promise<number[]> => {
    const rows = await all<{ id: number }>(
      `SELECT m.id FROM movies m
       LEFT JOIN movie_ddd d ON d.movie_id = m.id
       WHERE d.movie_id IS NULL OR d.checked_at IS NULL OR d.checked_at < ?
       ORDER BY d.checked_at IS NOT NULL, d.checked_at, m.id
       LIMIT ?`,
      [checkedBefore, limit]
    );
    return rows.map(row => row.id);
  },
};

export default MovieWarning;
