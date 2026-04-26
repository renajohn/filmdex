import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Movie from '../../models/movie';
import { normalizeMovieFilters, extractRuntimeMax, type MovieFilterInput } from '../filters/movieFilters';
import { projectMovie, MOVIE_COMPACT_COLUMNS } from '../projections/movieProjector';
import { formatList } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

export const SEARCH_MOVIES_DEFAULT_LIMIT = 20;
export const SEARCH_MOVIES_MAX_LIMIT = 100;

export const searchMoviesInputShape = {
  query: z.string().optional().describe('Free-text search across title, original title, director, comments and collection name.'),
  genre: z.string().optional().describe('Genre substring (e.g. "Sci-Fi"). Matches the m.genre column with LIKE.'),
  director: z.string().optional().describe('Director name substring.'),
  format: z.string().optional().describe('Physical format: Blu-ray, DVD, 4K UHD, etc.'),
  year_min: z.number().int().optional().describe('Minimum release year (inclusive).'),
  year_max: z.number().int().optional().describe('Maximum release year (inclusive).'),
  max_age: z.number().int().min(0).max(21).optional().describe('Maximum recommended age in years.'),
  min_imdb: z.number().min(0).max(10).optional().describe('Minimum IMDB rating.'),
  runtime_max: z.number().int().min(0).optional().describe('Maximum runtime in minutes.'),
  watched: z.boolean().optional().describe('If true, only watched titles; if false, only unwatched.'),
  limit: z.number().int().min(1).max(SEARCH_MOVIES_MAX_LIMIT).optional().describe(`Maximum number of items to return. Default ${SEARCH_MOVIES_DEFAULT_LIMIT}, max ${SEARCH_MOVIES_MAX_LIMIT}.`),
  format_output: z.enum(['markdown', 'json']).optional().describe('Output format: markdown (default) or json.'),
};

const searchMoviesInputSchema = z.object(searchMoviesInputShape);

export type SearchMoviesInput = z.infer<typeof searchMoviesInputSchema>;

export const handleSearchMovies = async (input: SearchMoviesInput) => {
  const filterInput: MovieFilterInput = {
    query: input.query,
    genre: input.genre,
    director: input.director,
    format: input.format,
    year_min: input.year_min,
    year_max: input.year_max,
    max_age: input.max_age,
    min_imdb: input.min_imdb,
    runtime_max: input.runtime_max,
    watched: input.watched,
  };
  const criteria = normalizeMovieFilters(filterInput);
  const runtimeMax = extractRuntimeMax(filterInput);

  const limit = input.limit ?? SEARCH_MOVIES_DEFAULT_LIMIT;
  const format = input.format_output ?? 'markdown';

  const all = await Movie.search(criteria);
  const filtered = runtimeMax !== null
    ? all.filter(m => typeof m.runtime === 'number' && m.runtime <= runtimeMax)
    : all;

  const totalCount = filtered.length;
  const truncated = totalCount > limit;
  const rows = filtered.slice(0, limit).map(projectMovie);

  return formatList({
    rows,
    columns: MOVIE_COMPACT_COLUMNS,
    totalCount,
    truncated,
    format,
    emptyMessage: 'No movies match the given filters.',
  });
};

export const registerSearchMovies = (server: McpServer): void => {
  server.registerTool(
    'search_movies',
    {
      title: 'Search movies',
      description:
        'Search the user\'s owned movie collection with rich filters (genre, director, format, year range, ' +
        'IMDB rating, recommended-age cap, runtime cap, watched flag). Returns a list with id as the first ' +
        'column so you can chain a get_movie call. Default limit 20, max 100.',
      inputSchema: searchMoviesInputShape,
    },
    safeToolHandler('search_movies', handleSearchMovies)
  );
};
