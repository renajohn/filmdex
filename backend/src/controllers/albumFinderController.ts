import { Request, Response } from 'express';
import albumFinderService, { FinderError, FinderSource } from '../services/albumFinderService';

const fail = (res: Response, error: unknown): void => {
  if (error instanceof FinderError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(502).json({ error: (error as Error).message || 'The album catalogue does not answer' });
};

const albumFinderController = {
  // GET ?q=: the albums and the artists a search finds
  search: async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await albumFinderService.search(String(req.query.q || '')));
    } catch (error) { fail(res, error); }
  },

  // GET /artists/:source/:id/albums: an artist's albums
  discography: async (req: Request, res: Response): Promise<void> => {
    try {
      const source: FinderSource = req.params.source === 'deezer' ? 'deezer' : 'itunes';
      res.json(await albumFinderService.discography(source, String(req.params.id)));
    } catch (error) { fail(res, error); }
  },

  // GET /editions?artist=&title=: the CD editions of an album on MusicBrainz
  editions: async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await albumFinderService.editions(String(req.query.artist || ''), String(req.query.title || '')));
    } catch (error) { fail(res, error); }
  },

  // POST { title, artist, year, cover, titleStatus, releaseGroupId }: an album without its edition
  addAlbum: async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(201).json(await albumFinderService.addAlbum(req.body || {}));
    } catch (error) { fail(res, error); }
  },
};

export default albumFinderController;
