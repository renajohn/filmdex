import { Request, Response } from 'express';
import lyricsService from '../services/lyricsService';
import logger from '../logger';

const positionOf = (req: Request): { albumId: number; disc: number; track: number } | null => {
  const albumId = Number(req.params.id);
  const disc = Number(req.params.disc);
  const track = Number(req.params.track);
  return [albumId, disc, track].every(Number.isInteger) ? { albumId, disc, track } : null;
};

const lyricsController = {
  /**
   * A track's words: those kept, else looked up there and then. POST looks
   * them up again, for a track LRCLIB did not know last time.
   */
  get: async (req: Request, res: Response): Promise<void> => {
    const position = positionOf(req);
    if (!position) {
      res.status(400).json({ error: 'Album, disc and track must be numbers' });
      return;
    }
    try {
      const lyrics = await lyricsService.forTrack(position.albumId, position.disc, position.track, { again: req.method === 'POST' });
      if (!lyrics) {
        res.status(404).json({ error: 'No such track on this album' });
        return;
      }
      res.json(lyrics);
    } catch (error) {
      logger.error('Error looking up lyrics:', error);
      res.status(502).json({ error: (error as Error).message || 'Failed to look up the lyrics' });
    }
  },
};

export default lyricsController;
