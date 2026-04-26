import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Movie from '../../models/movie';
import Album from '../../models/album';
import Book from '../../models/book';
import { formatJson } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

interface Bucket {
  total: number;
  by_format: Record<string, number>;
  by_genre: Record<string, number>;
}

const bump = (map: Record<string, number>, key: string | null | undefined): void => {
  const k = (key ?? '').toString().trim();
  if (!k) return;
  map[k] = (map[k] ?? 0) + 1;
};

const splitGenres = (raw: unknown): string[] => {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(/[,;/|]/).map(v => v.trim()).filter(Boolean);
  }
  return [];
};

export const handleGetCollectionStats = async () => {
  const [movies, albums, books] = await Promise.all([
    Movie.findAll(),
    Album.findAll(),
    Book.findAll(),
  ]);

  const ownedMovies = movies.filter(m => (m.title_status ?? 'owned') === 'owned');
  const ownedAlbums = albums.filter(a => (a.titleStatus ?? 'owned') === 'owned');
  const ownedBooks = books.filter(b => (b.titleStatus ?? 'owned') !== 'wish');

  const movieBucket: Bucket = { total: ownedMovies.length, by_format: {}, by_genre: {} };
  for (const m of ownedMovies) {
    bump(movieBucket.by_format, m.format);
    for (const g of splitGenres(m.genre)) bump(movieBucket.by_genre, g);
  }

  const albumBucket: Bucket = { total: ownedAlbums.length, by_format: {}, by_genre: {} };
  for (const a of ownedAlbums) {
    bump(albumBucket.by_format, a.format);
    for (const g of splitGenres(a.genres)) bump(albumBucket.by_genre, g);
  }

  const bookBucket: Bucket = { total: ownedBooks.length, by_format: {}, by_genre: {} };
  for (const b of ownedBooks) {
    bump(bookBucket.by_format, b.format);
    for (const g of splitGenres(b.genres)) bump(bookBucket.by_genre, g);
  }

  return formatJson({
    movies: movieBucket,
    albums: albumBucket,
    books: bookBucket,
    grand_total: movieBucket.total + albumBucket.total + bookBucket.total,
  });
};

export const registerGetCollectionStats = (server: McpServer): void => {
  server.registerTool(
    'get_collection_stats',
    {
      title: 'Get collection statistics',
      description:
        'Return counters by media type (movies, albums, books), and within each type counters ' +
        'by format and by genre across the whole owned collection.',
      inputSchema: {},
    },
    safeToolHandler('get_collection_stats', handleGetCollectionStats)
  );
};
