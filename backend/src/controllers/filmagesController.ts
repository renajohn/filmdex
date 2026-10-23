import { Request, Response } from 'express';
import Movie from '../models/movie';
import movieFilmagesService from '../services/movieFilmagesService';
import logger from '../logger';

const movieIdOf = async (req: Request, res: Response): Promise<number | null> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await Movie.findById(id))) {
    res.status(404).json({ error: 'Movie not found' });
    return null;
  }
  return id;
};

/** 14653, "14653" or "https://www.filmages.ch/films/detail/items/14653.html". */
export const parseFilmagesId = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  if (Number.isInteger(value) && (value as number) > 0) return value as number;
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^(?:.*items\/)?(\d+)(?:\.html)?\/?$/);
  return match ? Number(match[1]) : undefined;
};

const fail = (res: Response, error: unknown, what: string) => {
  logger.warn(`FilmAges ${what}: ${(error as Error).message}`);
  res.status(502).json({ error: `FilmAges did not answer: ${(error as Error).message}` });
};

const filmagesController = {
  get: async (req: Request, res: Response): Promise<void> => {
    const id = await movieIdOf(req, res);
    if (id === null) return;
    res.json(await movieFilmagesService.getMovieFilmages(id));
  },

  setLink: async (req: Request, res: Response): Promise<void> => {
    const filmagesId = parseFilmagesId(req.body?.filmagesId);
    if (filmagesId === undefined) {
      res.status(400).json({ error: 'filmagesId must be a FilmAges film id, its page address, or null' });
      return;
    }
    const id = await movieIdOf(req, res);
    if (id === null) return;
    try {
      res.json(await movieFilmagesService.setManualLink(id, filmagesId));
    } catch (error) { fail(res, error, `link of movie ${id}`); }
  },

  clearLink: async (req: Request, res: Response): Promise<void> => {
    const id = await movieIdOf(req, res);
    if (id === null) return;
    try {
      res.json(await movieFilmagesService.clearManualLink(id));
    } catch (error) { fail(res, error, `search for movie ${id}`); }
  },

  refresh: async (req: Request, res: Response): Promise<void> => {
    const id = await movieIdOf(req, res);
    if (id === null) return;
    try {
      await movieFilmagesService.refreshMovie(id);
      res.json(await movieFilmagesService.getMovieFilmages(id));
    } catch (error) { fail(res, error, `refresh of movie ${id}`); }
  },

  /** Look up every movie not looked up yet, in the background. */
  sweep: (_req: Request, res: Response): void => {
    movieFilmagesService.runSweep()
      .then(r => logger.info(`FilmAges sweep: ${r.found} found, ${r.notFound} not found`))
      .catch(error => logger.warn(`FilmAges sweep crashed: ${(error as Error).message}`));
    res.status(202).json({ started: true });
  },
};

export default filmagesController;
