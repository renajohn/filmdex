import type { MovieSearchCriteria } from '../../types';

export interface MovieFilterInput {
  query?: string;
  genre?: string;
  director?: string;
  format?: string;
  year_min?: number;
  year_max?: number;
  max_age?: number;
  min_imdb?: number;
  runtime_max?: number;
  watched?: boolean;
}

const quoteIfNeeded = (v: string): string => {
  if (/[\s,"]/.test(v)) {
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  return v;
};

const yearRange = (min: number | undefined, max: number | undefined): string | null => {
  const lo = typeof min === 'number' && Number.isFinite(min) ? Math.trunc(min) : undefined;
  const hi = typeof max === 'number' && Number.isFinite(max) ? Math.trunc(max) : undefined;
  if (lo !== undefined && hi !== undefined) return `year:${lo}-${hi}`;
  if (lo !== undefined) return `year:>=${lo}`;
  if (hi !== undefined) return `year:<=${hi}`;
  return null;
};

/**
 * Convert MCP-typed input into the existing Movie.search criteria.
 * Returns a MovieSearchCriteria where searchText is built from the typed filters.
 *
 * Note: Movie.search does not support a `runtime_max` filter natively; this is
 * applied in-memory by the tool handler after the SQL query runs.
 */
export const normalizeMovieFilters = (input: MovieFilterInput | undefined): MovieSearchCriteria => {
  const parts: string[] = [];
  const i = input ?? {};

  if (i.query && i.query.trim().length > 0) {
    parts.push(i.query.trim());
  }
  if (i.genre && i.genre.trim().length > 0) {
    parts.push(`genre:${quoteIfNeeded(i.genre.trim())}`);
  }
  if (i.director && i.director.trim().length > 0) {
    parts.push(`director:${quoteIfNeeded(i.director.trim())}`);
  }
  // Note: format is also a typed criteria below — but using format: filter syntax
  // is consistent with other filter handling.
  if (i.format && i.format.trim().length > 0) {
    parts.push(`format:${quoteIfNeeded(i.format.trim())}`);
  }
  const yr = yearRange(i.year_min, i.year_max);
  if (yr) parts.push(yr);
  if (typeof i.max_age === 'number' && Number.isFinite(i.max_age)) {
    parts.push(`recommended_age:<=${Math.trunc(i.max_age)}`);
  }
  if (typeof i.min_imdb === 'number' && Number.isFinite(i.min_imdb)) {
    parts.push(`imdb_rating:>=${i.min_imdb}`);
  }
  if (typeof i.watched === 'boolean') {
    parts.push(`watched:${i.watched ? 'true' : 'false'}`);
  }

  return {
    searchText: parts.join(' '),
  };
};

/** Whether runtime_max needs in-memory filtering (Movie.search has no runtime filter). */
export const extractRuntimeMax = (input: MovieFilterInput | undefined): number | null => {
  const v = input?.runtime_max;
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
};
