import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Movie from '../../models/movie';
import { formatJson, formatError } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

export const clearMovieWatchedInputShape = {
  id: z.number().int().positive().describe('Local movie id (the integer id from search_movies).'),
};

const clearMovieWatchedInputSchema = z.object(clearMovieWatchedInputShape);
export type ClearMovieWatchedInput = z.infer<typeof clearMovieWatchedInputSchema>;

export const handleClearMovieWatched = async (input: ClearMovieWatchedInput) => {
  const result = await Movie.clearWatched(input.id);
  if (result.changes === 0) {
    return formatError(`Movie with id ${input.id} not found.`);
  }
  return formatJson(result);
};

export const registerClearMovieWatched = (server: McpServer): void => {
  server.registerTool(
    'clear_movie_watched',
    {
      title: 'Clear a movie watch history',
      description:
        'Reset a movie watch history: clears last_watched and sets watch_count back to zero.',
      inputSchema: clearMovieWatchedInputShape,
    },
    safeToolHandler('clear_movie_watched', handleClearMovieWatched)
  );
};
