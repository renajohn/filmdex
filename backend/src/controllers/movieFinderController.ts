import { Request, Response } from 'express';
import movieFinderService, { MovieFinderError } from '../services/movieFinderService';

const fail = (res: Response, error: unknown): void => {
  if (error instanceof MovieFinderError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(502).json({ error: (error as Error).message || 'TMDB does not answer' });
};

const movieFinderController = {
  // GET ?q=: the movies, people and sagas a search finds
  search: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await movieFinderService.search(String(req.query.q || ''))); } catch (error) { fail(res, error); }
  },

  // GET /people/:id: a person's movies
  person: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await movieFinderService.person(parseInt(String(req.params.id), 10))); } catch (error) { fail(res, error); }
  },

  // GET /sagas/:id: a saga's movies
  saga: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await movieFinderService.saga(parseInt(String(req.params.id), 10))); } catch (error) { fail(res, error); }
  },

  // POST { tmdbId, mediaType, titleStatus, format, edition, price, acquiredDate, comments }
  addMovie: async (req: Request, res: Response): Promise<void> => {
    try { res.status(201).json(await movieFinderService.addMovie(req.body || {})); } catch (error) { fail(res, error); }
  },

  // POST { name, movies: [{ tmdbId, mediaType }], titleStatus, format, price, acquiredDate, comments }
  addBoxSet: async (req: Request, res: Response): Promise<void> => {
    try { res.status(201).json(await movieFinderService.addBoxSet(req.body || {})); } catch (error) { fail(res, error); }
  },

  // POST { movieIds, format, edition, price, acquiredDate, comments }: wished movies bought
  buy: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await movieFinderService.buy(req.body || {})); } catch (error) { fail(res, error); }
  },
};

export default movieFinderController;
