import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import collectionService from '../../services/collectionService';
import { projectMovie, MOVIE_COMPACT_COLUMNS } from '../projections/movieProjector';
import { formatList } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

export const LIST_WATCH_NEXT_DEFAULT_LIMIT = 20;
export const LIST_WATCH_NEXT_MAX_LIMIT = 100;

export const listWatchNextInputShape = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(LIST_WATCH_NEXT_MAX_LIMIT)
    .optional()
    .describe(`Maximum number of items to return. Default ${LIST_WATCH_NEXT_DEFAULT_LIMIT}, max ${LIST_WATCH_NEXT_MAX_LIMIT}.`),
  format_output: z.enum(['markdown', 'json']).optional().describe('Output format: markdown (default) or json.'),
};

const listWatchNextInputSchema = z.object(listWatchNextInputShape);
export type ListWatchNextInput = z.infer<typeof listWatchNextInputSchema>;

export const handleListWatchNext = async (input: ListWatchNextInput) => {
  const limit = input.limit ?? LIST_WATCH_NEXT_DEFAULT_LIMIT;
  const format = input.format_output ?? 'markdown';

  const movies = await collectionService.getWatchNextMovies();
  const totalCount = movies.length;
  const truncated = totalCount > limit;
  const rows = movies.slice(0, limit).map(projectMovie);

  return formatList({
    rows,
    columns: MOVIE_COMPACT_COLUMNS,
    totalCount,
    truncated,
    format,
    emptyMessage: 'The Watch Next queue is empty.',
  });
};

export const registerListWatchNext = (server: McpServer): void => {
  server.registerTool(
    'list_watch_next',
    {
      title: 'List Watch Next movies',
      description:
        'List the movies queued in the user\'s "Watch Next" collection, newest additions first. ' +
        'Returns a list with id as the first column so you can chain a get_movie call. Default limit 20, max 100.',
      inputSchema: listWatchNextInputShape,
    },
    safeToolHandler('list_watch_next', handleListWatchNext)
  );
};
