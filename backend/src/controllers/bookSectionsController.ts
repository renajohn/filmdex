import { Request, Response } from 'express';
import bookSectionsService, { BookSectionsError } from '../services/bookSectionsService';

const fail = (res: Response, error: unknown): void => {
  if (error instanceof BookSectionsError) { res.status(error.status).json({ error: error.message }); return; }
  res.status(500).json({ error: (error as Error).message });
};

const bookSectionsController = {
  // GET: every score, with a composer suggested when none is kept
  list: async (_req: Request, res: Response): Promise<void> => {
    try { res.json(await bookSectionsService.list()); } catch (error) { fail(res, error); }
  },
  // PUT { updates: [{ id, composer }] }: composers confirmed
  setComposers: async (req: Request, res: Response): Promise<void> => {
    try { res.json({ changed: await bookSectionsService.setComposers(req.body?.updates) }); } catch (error) { fail(res, error); }
  },
  // GET: the reading journal
  reading: async (_req: Request, res: Response): Promise<void> => {
    try { res.json(await bookSectionsService.reading()); } catch (error) { fail(res, error); }
  },
  // GET: the readings of a book
  readingsOf: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await bookSectionsService.readingsOf(parseInt(String(req.params.id), 10))); } catch (error) { fail(res, error); }
  },
  // POST { date }: read (again), today when no date
  addReading: async (req: Request, res: Response): Promise<void> => {
    try { res.status(201).json(await bookSectionsService.addReading(parseInt(String(req.params.id), 10), req.body?.date)); } catch (error) { fail(res, error); }
  },
  // PUT { date }: a reading's date corrected
  changeReading: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await bookSectionsService.changeReading(parseInt(String(req.params.id), 10), req.body?.date)); } catch (error) { fail(res, error); }
  },
  removeReading: async (req: Request, res: Response): Promise<void> => {
    try { await bookSectionsService.removeReading(parseInt(String(req.params.id), 10)); res.status(204).end(); } catch (error) { fail(res, error); }
  },
  // GET ?series=: the notes on a series, or on all of them
  seriesNotes: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await bookSectionsService.seriesNotes(req.query.series ? String(req.query.series) : null)); } catch (error) { fail(res, error); }
  },
  // POST { series, name, note }
  addSeriesNote: async (req: Request, res: Response): Promise<void> => {
    try { res.status(201).json(await bookSectionsService.addSeriesNote(req.body || {})); } catch (error) { fail(res, error); }
  },
  deleteSeriesNote: async (req: Request, res: Response): Promise<void> => {
    try { await bookSectionsService.deleteSeriesNote(parseInt(String(req.params.id), 10)); res.status(204).end(); } catch (error) { fail(res, error); }
  },
};

export default bookSectionsController;
