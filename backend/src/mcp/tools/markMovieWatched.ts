import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Movie from '../../models/movie';
import { formatJson, formatError } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

export const markMovieWatchedInputShape = {
  id: z.number().int().positive().describe('Local movie id (the integer id from search_movies).'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format.')
    .optional()
    .describe('Watch date in YYYY-MM-DD format. Defaults to today when omitted.'),
};

const markMovieWatchedInputSchema = z.object(markMovieWatchedInputShape);
export type MarkMovieWatchedInput = z.infer<typeof markMovieWatchedInputSchema>;

export const handleMarkMovieWatched = async (input: MarkMovieWatchedInput) => {
  const result = await Movie.markAsWatched(input.id, input.date ?? null, true);
  if (result.changes === 0) {
    return formatError(`Movie with id ${input.id} not found.`);
  }
  return formatJson(result);
};

export const registerMarkMovieWatched = (server: McpServer): void => {
  server.registerTool(
    'mark_movie_watched',
    {
      title: 'Mark a movie as watched',
      description:
        'Mark a movie as watched on a given date. Sets last_watched, clears never_seen, and increments watch_count by one. If date is omitted, today is used.',
      inputSchema: markMovieWatchedInputShape,
    },
    safeToolHandler('mark_movie_watched', handleMarkMovieWatched)
  );
};
