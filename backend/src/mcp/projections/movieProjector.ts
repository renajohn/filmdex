export interface MovieCompact {
  id: number;
  title: string | null;
  director: string | null;
  release_year: number | null;
  genre: string | null;
  format: string | null;
  runtime: number | null;
  recommended_age: number | null;
  imdb_rating: number | null;
  watched: boolean;
  last_watched: string | null;
}

export const MOVIE_COMPACT_COLUMNS: ReadonlyArray<keyof MovieCompact> = [
  'id',
  'title',
  'director',
  'release_year',
  'genre',
  'format',
  'runtime',
  'recommended_age',
  'imdb_rating',
  'watched',
  'last_watched',
];

const extractYear = (releaseDate: unknown): number | null => {
  if (releaseDate == null) return null;
  if (typeof releaseDate === 'number') return releaseDate;
  if (typeof releaseDate === 'string') {
    const m = releaseDate.match(/^(\d{4})/);
    if (m) {
      const y = parseInt(m[1], 10);
      return Number.isFinite(y) ? y : null;
    }
  }
  return null;
};

interface MovieLike {
  id?: number | null;
  title?: string | null;
  director?: string | null;
  release_date?: unknown;
  genre?: string | null;
  format?: string | null;
  runtime?: number | null;
  recommended_age?: number | null;
  imdb_rating?: number | null;
  watch_count?: number | null;
  last_watched?: string | null;
}

/**
 * Accepts any object shaped roughly like a movie row. Uses a loose interface so
 * that callers can pass either MovieData rows or raw DB rows (where `release_date`
 * may be a year-int instead of an ISO string).
 */
export const projectMovie = (m: MovieLike): MovieCompact => {
  const watchCount = typeof m.watch_count === 'number' ? m.watch_count : 0;
  return {
    id: m.id ?? 0,
    title: m.title ?? null,
    director: m.director ?? null,
    release_year: extractYear(m.release_date),
    genre: m.genre ?? null,
    format: m.format ?? null,
    runtime: m.runtime ?? null,
    recommended_age: m.recommended_age ?? null,
    imdb_rating: m.imdb_rating ?? null,
    watched: watchCount > 0,
    last_watched: m.last_watched ?? null,
  };
};
