import { Request, Response } from 'express';
import Album from '../models/album';
import { GUIDE_SOURCES, GuideSource } from '../models/albumGuide';
import albumGuideService from '../services/albumGuideService';
import logger from '../logger';

const albumIdOf = async (req: Request, res: Response): Promise<number | null> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await Album.findById(id))) {
    res.status(404).json({ error: 'Album not found' });
    return null;
  }
  return id;
};

const albumGuideController = {
  /** The guide, or null when the album has none yet. */
  get: async (req: Request, res: Response): Promise<void> => {
    const id = await albumIdOf(req, res);
    if (id === null) return;
    res.json(await albumGuideService.get(id));
  },

  /** A guide written by hand, or handed over by Claude: the source says which, and defaults to the owner. */
  save: async (req: Request, res: Response): Promise<void> => {
    const id = await albumIdOf(req, res);
    if (id === null) return;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const source = (req.body?.source ?? 'manual') as GuideSource;
    if (!text) {
      res.status(400).json({ error: 'A guide needs some text' });
      return;
    }
    if (!GUIDE_SOURCES.includes(source)) {
      res.status(400).json({ error: `Unknown source "${source}". Expected ${GUIDE_SOURCES.join(', ')}.` });
      return;
    }
    res.json(await albumGuideService.save(id, text, source));
  },

  remove: async (req: Request, res: Response): Promise<void> => {
    const id = await albumIdOf(req, res);
    if (id === null) return;
    await albumGuideService.remove(id);
    res.status(204).end();
  },

  /** Has the local LLM write the guide, replacing the current one. Takes a minute or so. */
  generate: async (req: Request, res: Response): Promise<void> => {
    const id = await albumIdOf(req, res);
    if (id === null) return;
    try {
      res.json(await albumGuideService.generate(id));
    } catch (error) {
      const message = (error as Error).message;
      logger.warn(`Album guide for album ${id} not written: ${message}`);
      const unreachable = message.startsWith('Network error') || message.startsWith('HTTP');
      res.status(unreachable ? 503 : 422).json({
        error: unreachable ? 'The local LLM did not answer. Please try again in a moment.' : message,
      });
    }
  },
};

export default albumGuideController;
