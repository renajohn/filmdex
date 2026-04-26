import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Album from '../../models/album';
import { normalizeAlbumFilters, extractAlbumFormat, type AlbumFilterInput } from '../filters/albumFilters';
import { projectAlbum, ALBUM_COMPACT_COLUMNS } from '../projections/albumProjector';
import { formatList } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

export const SEARCH_ALBUMS_DEFAULT_LIMIT = 20;
export const SEARCH_ALBUMS_MAX_LIMIT = 100;

export const searchAlbumsInputShape = {
  query: z.string().optional().describe('Free-text search across title, artist, label, genre.'),
  artist: z.string().optional().describe('Artist name substring.'),
  genre: z.string().optional().describe('Genre substring (e.g. "Rock").'),
  format: z.string().optional().describe('Format substring (e.g. "CD", "Vinyl", "Digital"). Filtered in-memory because the album search parser does not support format natively.'),
  year_min: z.number().int().optional().describe('Minimum release year (inclusive).'),
  year_max: z.number().int().optional().describe('Maximum release year (inclusive).'),
  limit: z.number().int().min(1).max(SEARCH_ALBUMS_MAX_LIMIT).optional().describe(`Maximum items to return. Default ${SEARCH_ALBUMS_DEFAULT_LIMIT}, max ${SEARCH_ALBUMS_MAX_LIMIT}.`),
  format_output: z.enum(['markdown', 'json']).optional().describe('Output format: markdown (default) or json.'),
};

const searchAlbumsInputSchema = z.object(searchAlbumsInputShape);
export type SearchAlbumsInput = z.infer<typeof searchAlbumsInputSchema>;

export const handleSearchAlbums = async (input: SearchAlbumsInput) => {
  const filterInput: AlbumFilterInput = {
    query: input.query,
    artist: input.artist,
    genre: input.genre,
    format: input.format,
    year_min: input.year_min,
    year_max: input.year_max,
  };
  const queryString = normalizeAlbumFilters(filterInput);
  const formatNeedle = extractAlbumFormat(filterInput);

  const limit = input.limit ?? SEARCH_ALBUMS_DEFAULT_LIMIT;
  const format = input.format_output ?? 'markdown';

  const all = queryString.length > 0 ? await Album.search(queryString) : await Album.findAll();
  const filtered = formatNeedle !== null
    ? all.filter(a => typeof a.format === 'string' && a.format.toLowerCase().includes(formatNeedle.toLowerCase()))
    : all;

  const totalCount = filtered.length;
  const truncated = totalCount > limit;
  const rows = filtered.slice(0, limit).map(projectAlbum);

  return formatList({
    rows,
    columns: ALBUM_COMPACT_COLUMNS,
    totalCount,
    truncated,
    format,
    emptyMessage: 'No albums match the given filters.',
  });
};

export const registerSearchAlbums = (server: McpServer): void => {
  server.registerTool(
    'search_albums',
    {
      title: 'Search albums',
      description:
        'Search the user\'s owned album collection (artist, genre, format, year range, free-text query). ' +
        'Returns a list with id first so you can chain get_album. Default limit 20, max 100.',
      inputSchema: searchAlbumsInputShape,
    },
    safeToolHandler('search_albums', handleSearchAlbums)
  );
};
