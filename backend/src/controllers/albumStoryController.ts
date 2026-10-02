import { Request, Response } from 'express';
import Album from '../models/album';
import albumStoryService from '../services/albumStoryService';

const albumIdOf = async (req: Request, res: Response): Promise<number | null> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await Album.findById(id))) {
    res.status(404).json({ error: 'Album not found' });
    return null;
  }
  return id;
};

const answer = async (req: Request, res: Response, refresh: boolean): Promise<void> => {
  const id = await albumIdOf(req, res);
  if (id === null) return;
  try {
    res.json(await albumStoryService.getStory(id, { refresh }));
  } catch {
    res.status(502).json({ error: 'MusicBrainz or Wikipedia did not answer. Please try again in a moment.' });
  }
};

const albumStoryController = {
  get: (req: Request, res: Response): Promise<void> => answer(req, res, false),
  refresh: (req: Request, res: Response): Promise<void> => answer(req, res, true),
};

export default albumStoryController;
