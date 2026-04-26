import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Album from '../../models/album';
import Track from '../../models/track';
import { formatJson, formatError } from '../format/resultFormatter';
import { safeToolHandler } from '../safeHandler';

export const getAlbumInputShape = {
  id: z.number().int().positive().describe('Local album id (the integer id from search_albums).'),
};

const getAlbumInputSchema = z.object(getAlbumInputShape);
export type GetAlbumInput = z.infer<typeof getAlbumInputSchema>;

export const handleGetAlbum = async (input: GetAlbumInput) => {
  const album = await Album.findById(input.id);
  if (!album) {
    return formatError(`Album with id ${input.id} not found.`);
  }
  const tracks = await Track.findByCdId(input.id).catch(() => []);

  // Group tracks by disc number for a more readable structure.
  const discsMap: Record<number, Array<{ track_number: number; title: string; duration_sec: number | null; isrc: string | null }>> = {};
  for (const t of tracks) {
    if (!discsMap[t.discNumber]) discsMap[t.discNumber] = [];
    discsMap[t.discNumber].push({
      track_number: t.trackNumber,
      title: t.title,
      duration_sec: t.durationSec,
      isrc: t.isrc,
    });
  }
  const discs = Object.keys(discsMap)
    .map(n => parseInt(n, 10))
    .sort((a, b) => a - b)
    .map(n => ({ disc_number: n, tracks: discsMap[n] }));

  return formatJson({
    ...album,
    discs,
  });
};

export const registerGetAlbum = (server: McpServer): void => {
  server.registerTool(
    'get_album',
    {
      title: 'Get album details',
      description: 'Return the full JSON detail of a single album by id, including tracks grouped by disc.',
      inputSchema: getAlbumInputShape,
    },
    safeToolHandler('get_album', handleGetAlbum)
  );
};
