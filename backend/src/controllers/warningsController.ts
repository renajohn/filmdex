import { Request, Response } from 'express';
import Movie from '../models/movie';
import ddd, { DddQuotaError } from '../services/doesTheDogDieService';
import warningsService, { isValidSnapshotDate } from '../services/warningsService';
import { isOverride, isTopic } from '../warnings/rules';
import logger from '../logger';

const movieIdOf = async (req: Request, res: Response): Promise<number | null> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await Movie.findById(id))) {
    res.status(404).json({ error: 'Movie not found' });
    return null;
  }
  return id;
};

const warningsController = {
  get: async (req: Request, res: Response): Promise<void> => {
    const id = await movieIdOf(req, res);
    if (id === null) return;
    res.json(await warningsService.getMovieWarnings(id));
  },

  setOverride: async (req: Request, res: Response): Promise<void> => {
    const topic = String(req.params.topic);
    const override = req.body?.override;
    if (!isTopic(topic) || !(override === null || isOverride(override))) {
      res.status(400).json({ error: "Expected topic spiders|snakes and override 'with', 'without' or null" });
      return;
    }
    const id = await movieIdOf(req, res);
    if (id === null) return;
    res.json(await warningsService.setOverride(id, topic, override));
  },

  setLink: async (req: Request, res: Response): Promise<void> => {
    const dddId = req.body?.dddId;
    if (!Number.isInteger(dddId) || dddId <= 0) {
      res.status(400).json({ error: 'dddId must be a positive integer' });
      return;
    }
    const id = await movieIdOf(req, res);
    if (id === null) return;
    res.json(await warningsService.setManualLink(id, dddId));
  },

  refresh: async (req: Request, res: Response): Promise<void> => {
    const id = await movieIdOf(req, res);
    if (id === null) return;
    if (!ddd.isConfigured()) {
      res.status(503).json({ error: 'DoesTheDogDie is not configured: set DOES_DOG_DIE' });
      return;
    }
    try {
      await warningsService.refreshMovie(id);
      res.json(await warningsService.getMovieWarnings(id));
    } catch (error) {
      if (error instanceof DddQuotaError) {
        res.status(429).json({ error: error.message });
        return;
      }
      logger.warn(`Warning refresh failed for movie ${id}: ${(error as Error).message}`);
      res.status(502).json({ error: 'DoesTheDogDie did not answer' });
    }
  },

  importSnapshot: async (req: Request, res: Response): Promise<void> => {
    if (!Array.isArray(req.body?.movies) || !isValidSnapshotDate(req.body?.fetched_at)) {
      res.status(400).json({ error: 'Expected { fetched_at: <date>, movies: [...] }' });
      return;
    }
    res.json(await warningsService.importSnapshot(req.body));
  },
};

export default warningsController;
