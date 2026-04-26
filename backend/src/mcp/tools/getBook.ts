import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Book from '../../models/book';
import bookCommentService from '../../services/bookCommentService';
import { formatJson, formatError } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

export const getBookInputShape = {
  id: z.number().int().positive().describe('Local book id (the integer id from search_books).'),
};

const getBookInputSchema = z.object(getBookInputShape);
export type GetBookInput = z.infer<typeof getBookInputSchema>;

export const handleGetBook = async (input: GetBookInput) => {
  const book = await Book.findById(input.id);
  if (!book) {
    return formatError(`Book with id ${input.id} not found.`);
  }
  const comments = await bookCommentService
    .getCommentsByBookId(input.id)
    .catch(() => []);

  return formatJson({
    ...book,
    comments: Array.isArray(comments) ? comments : [],
  });
};

export const registerGetBook = (server: McpServer): void => {
  server.registerTool(
    'get_book',
    {
      title: 'Get book details',
      description: 'Return the full JSON detail of a single book by id, including reading comments.',
      inputSchema: getBookInputShape,
    },
    safeToolHandler('get_book', handleGetBook)
  );
};
