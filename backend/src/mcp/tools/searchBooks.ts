import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Book from '../../models/book';
import { normalizeBookFilters, extractReadFilter, type BookFilterInput } from '../filters/bookFilters';
import { projectBook, BOOK_COMPACT_COLUMNS } from '../projections/bookProjector';
import { formatList } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

export const SEARCH_BOOKS_DEFAULT_LIMIT = 20;
export const SEARCH_BOOKS_MAX_LIMIT = 100;

export const searchBooksInputShape = {
  query: z.string().optional().describe('Free-text search across title, subtitle, authors, ISBN, series, description.'),
  author: z.string().optional().describe('Author name substring.'),
  genre: z.string().optional().describe('Genre substring (e.g. "Fantasy").'),
  read: z.boolean().optional().describe('If true, only books that have been read; if false, only unread.'),
  limit: z.number().int().min(1).max(SEARCH_BOOKS_MAX_LIMIT).optional().describe(`Maximum items to return. Default ${SEARCH_BOOKS_DEFAULT_LIMIT}, max ${SEARCH_BOOKS_MAX_LIMIT}.`),
  format_output: z.enum(['markdown', 'json']).optional().describe('Output format: markdown (default) or json.'),
};

const searchBooksInputSchema = z.object(searchBooksInputShape);
export type SearchBooksInput = z.infer<typeof searchBooksInputSchema>;

export const handleSearchBooks = async (input: SearchBooksInput) => {
  const filterInput: BookFilterInput = {
    query: input.query,
    author: input.author,
    genre: input.genre,
    read: input.read,
  };
  const queryString = normalizeBookFilters(filterInput);
  const readFilter = extractReadFilter(filterInput);

  const limit = input.limit ?? SEARCH_BOOKS_DEFAULT_LIMIT;
  const format = input.format_output ?? 'markdown';

  const all = queryString.length > 0 ? await Book.search(queryString) : await Book.findAll();
  const filtered = readFilter === null
    ? all
    : all.filter(b => {
        const wasRead = !!b.readDate && b.readDate.trim() !== '';
        return wasRead === readFilter;
      });

  const totalCount = filtered.length;
  const truncated = totalCount > limit;
  const rows = filtered.slice(0, limit).map(projectBook);

  return formatList({
    rows,
    columns: BOOK_COMPACT_COLUMNS,
    totalCount,
    truncated,
    format,
    emptyMessage: 'No books match the given filters.',
  });
};

export const registerSearchBooks = (server: McpServer): void => {
  server.registerTool(
    'search_books',
    {
      title: 'Search books',
      description:
        'Search the user\'s owned and borrowed book collection (author, genre, read flag, free-text). ' +
        'Returns a list with id first so you can chain get_book. Default limit 20, max 100.',
      inputSchema: searchBooksInputShape,
    },
    safeToolHandler('search_books', handleSearchBooks)
  );
};
