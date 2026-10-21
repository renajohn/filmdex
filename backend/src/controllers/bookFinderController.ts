import { Request, Response } from 'express';
import bookFinderService, { BookFinderError, BookKind, BookLanguage } from '../services/bookFinderService';

const fail = (res: Response, error: unknown): void => {
  if (error instanceof BookFinderError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(502).json({ error: (error as Error).message || 'Google Books does not answer' });
};

const kindOf = (value: unknown): BookKind => (value === 'book' || value === 'graphic-novel' || value === 'score' ? value : 'all');

const languageOf = (value: unknown): BookLanguage => (value === 'en' || value === 'de' || value === 'any' ? value : 'fr');

const bookFinderController = {
  // GET ?q=&language=&kind=: the books, series and authors a search finds
  search: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await bookFinderService.search(String(req.query.q || ''), languageOf(req.query.language), kindOf(req.query.kind))); } catch (error) { fail(res, error); }
  },

  // GET /series?name=&author=&language=: a series' volumes
  series: async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await bookFinderService.series(String(req.query.name || ''), req.query.author ? String(req.query.author) : null, languageOf(req.query.language)));
    } catch (error) { fail(res, error); }
  },

  // GET /authors?name=&language=: an author's books
  author: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await bookFinderService.author(String(req.query.name || ''), languageOf(req.query.language))); } catch (error) { fail(res, error); }
  },

  // POST { book, titleStatus, format, language, bookType, owner, priceChf, purchasedAt }: a book found, added
  add: async (req: Request, res: Response): Promise<void> => {
    try { res.status(201).json(await bookFinderService.add(req.body || {})); } catch (error) { fail(res, error); }
  },

  // POST { books: [{ book, … }], priceChf }: several volumes at once, the price shared out
  addMany: async (req: Request, res: Response): Promise<void> => {
    try { res.status(201).json(await bookFinderService.addMany(req.body?.books || [], req.body?.priceChf)); } catch (error) { fail(res, error); }
  },

  // POST { bookIds, priceChf, purchasedAt, format, language, owner, bookType }: wished books bought
  buy: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await bookFinderService.buy(req.body?.bookIds || [], req.body || {})); } catch (error) { fail(res, error); }
  },
};

export default bookFinderController;
