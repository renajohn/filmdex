import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Movie from '../../models/movie';
import Album from '../../models/album';
import Book from '../../models/book';
import { formatList } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

export const LIST_WISHLIST_DEFAULT_LIMIT = 20;
export const LIST_WISHLIST_MAX_LIMIT = 100;

export const listWishlistInputShape = {
  type: z.enum(['movie', 'album', 'book']).optional().describe('Restrict to a single media type. If omitted, returns all types.'),
  limit: z.number().int().min(1).max(LIST_WISHLIST_MAX_LIMIT).optional().describe(`Maximum items to return. Default ${LIST_WISHLIST_DEFAULT_LIMIT}, max ${LIST_WISHLIST_MAX_LIMIT}.`),
  format_output: z.enum(['markdown', 'json']).optional().describe('Output format: markdown (default) or json.'),
};

const listWishlistInputSchema = z.object(listWishlistInputShape);
export type ListWishlistInput = z.infer<typeof listWishlistInputSchema>;

interface WishlistRow extends Record<string, unknown> {
  id: number;
  type: 'movie' | 'album' | 'book';
  title: string | null;
  creator: string | null;
  year: number | null;
  format: string | null;
}

const WISHLIST_COLUMNS: ReadonlyArray<keyof WishlistRow & string> = [
  'id',
  'type',
  'title',
  'creator',
  'year',
  'format',
];

const extractMovieYear = (releaseDate: unknown): number | null => {
  if (typeof releaseDate === 'string') {
    const m = releaseDate.match(/^(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
  }
  return null;
};

/**
 * Round-robin interleave of multiple typed sequences. Ensures that when the
 * caller hits the `limit`, the returned slice contains a representative sample
 * of every type that has items, instead of silently dropping later types.
 */
const interleave = <T>(buckets: ReadonlyArray<ReadonlyArray<T>>): T[] => {
  const out: T[] = [];
  const maxLen = buckets.reduce((m, b) => Math.max(m, b.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (i < bucket.length) out.push(bucket[i]);
    }
  }
  return out;
};

export const handleListWishlist = async (input: ListWishlistInput) => {
  const requestedType = input.type;
  const limit = input.limit ?? LIST_WISHLIST_DEFAULT_LIMIT;
  const format = input.format_output ?? 'markdown';

  const movieRows: WishlistRow[] = [];
  const albumRows: WishlistRow[] = [];
  const bookRows: WishlistRow[] = [];

  if (!requestedType || requestedType === 'movie') {
    const movies = await Movie.findByStatus('wish').catch(() => []);
    for (const m of movies) {
      movieRows.push({
        id: m.id as number,
        type: 'movie',
        title: (m.title as string | null | undefined) ?? null,
        creator: (m.director as string | null | undefined) ?? null,
        year: extractMovieYear(m.release_date),
        format: (m.format as string | null | undefined) ?? null,
      });
    }
  }
  if (!requestedType || requestedType === 'album') {
    const albums = await Album.findByStatus('wish').catch(() => []);
    for (const a of albums) {
      const artist = Array.isArray(a.artist)
        ? (a.artist as string[]).filter(Boolean).join(', ') || null
        : ((a.artist as unknown as string) ?? null);
      albumRows.push({
        id: a.id,
        type: 'album',
        title: a.title ?? null,
        creator: artist,
        year: a.releaseYear ?? null,
        format: a.format ?? null,
      });
    }
  }
  if (!requestedType || requestedType === 'book') {
    const books = await Book.findByStatus('wish').catch(() => []);
    for (const b of books) {
      const authors = Array.isArray(b.authors)
        ? (b.authors as string[]).filter(Boolean).join(', ') || null
        : ((b.authors as unknown as string) ?? null);
      bookRows.push({
        id: b.id,
        type: 'book',
        title: b.title ?? null,
        creator: authors,
        year: b.publishedYear ?? null,
        format: b.format ?? null,
      });
    }
  }

  // When a type is requested, preserve the natural per-type ordering.
  // When no type is requested, interleave so truncation doesn't hide entire
  // types behind the items of an earlier type.
  const rows = requestedType
    ? [...movieRows, ...albumRows, ...bookRows]
    : interleave([movieRows, albumRows, bookRows]);

  const totalCount = rows.length;
  const truncated = totalCount > limit;
  const sliced = rows.slice(0, limit);

  return formatList<WishlistRow>({
    rows: sliced,
    columns: WISHLIST_COLUMNS,
    totalCount,
    truncated,
    format,
    emptyMessage: 'Your wishlist is empty.',
  });
};

export const registerListWishlist = (server: McpServer): void => {
  server.registerTool(
    'list_wishlist',
    {
      title: 'List wishlist',
      description:
        'List items in the wishlist (title_status=wish) across movies, albums and books. ' +
        'Optional `type` parameter to restrict to one media type. Default limit 20, max 100.',
      inputSchema: listWishlistInputShape,
    },
    safeToolHandler('list_wishlist', handleListWishlist)
  );
};
