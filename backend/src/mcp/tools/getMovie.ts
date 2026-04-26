import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Movie from '../../models/movie';
import MovieCast from '../../models/movieCast';
import MovieCrew from '../../models/movieCrew';
import MovieCollection from '../../models/movieCollection';
import { formatJson, formatError } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

export const getMovieInputShape = {
  id: z.number().int().positive().describe('Local movie id (the integer id from search_movies).'),
};

const getMovieInputSchema = z.object(getMovieInputShape);
export type GetMovieInput = z.infer<typeof getMovieInputSchema>;

export const handleGetMovie = async (input: GetMovieInput) => {
  const movie = await Movie.findById(input.id);
  if (!movie) {
    return formatError(`Movie with id ${input.id} not found.`);
  }

  const [cast, crew, collections] = await Promise.all([
    MovieCast.findByMovieId(input.id).catch(() => []),
    MovieCrew.findByMovieId(input.id).catch(() => []),
    MovieCollection.findByMovieId(input.id).catch(() => []),
  ]);

  return formatJson({
    ...movie,
    cast: Array.isArray(cast) ? cast : [],
    crew: Array.isArray(crew) ? crew : [],
    collections: Array.isArray(collections) ? collections : [],
  });
};

export const registerGetMovie = (server: McpServer): void => {
  server.registerTool(
    'get_movie',
    {
      title: 'Get movie details',
      description:
        'Return the full JSON detail of a single movie by id, including plot, cast, crew, collections.',
      inputSchema: getMovieInputShape,
    },
    safeToolHandler('get_movie', handleGetMovie)
  );
};
