import { Request, Response } from 'express';
import scorePiecesService, { ScorePiecesError } from '../services/scorePiecesService';
import coverScanService from '../services/coverScanService';
import scoreAddService from '../services/scoreAddService';
import logger from '../logger';

const fail = (res: Response, error: unknown): void => {
  if (error instanceof ScorePiecesError) { res.status(error.status).json({ error: error.message }); return; }
  logger.error('Score pieces:', error);
  res.status(/busy or unavailable/.test((error as Error).message) ? 503 : 500).json({ error: (error as Error).message });
};
const id = (value: unknown) => parseInt(String(value), 10);

const scorePiecesController = {
  // GET: a score's pieces, with the tracks playing them
  pieces: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await scorePiecesService.pieces(id(req.params.id))); } catch (error) { fail(res, error); }
  },
  // POST { workIds } or { title }
  addPieces: async (req: Request, res: Response): Promise<void> => {
    try { res.status(201).json(await scorePiecesService.addPieces(id(req.params.id), req.body || {})); } catch (error) { fail(res, error); }
  },
  removePiece: async (req: Request, res: Response): Promise<void> => {
    try { await scorePiecesService.removePiece(id(req.params.id), id(req.params.pieceId)); res.status(204).end(); } catch (error) { fail(res, error); }
  },
  // PUT { preferredAlbumId }: the recording played first
  choose: async (req: Request, res: Response): Promise<void> => {
    try {
      await scorePiecesService.choose(id(req.params.id), id(req.params.pieceId), req.body?.preferredAlbumId ? id(req.body.preferredAlbumId) : null);
      res.status(204).end();
    } catch (error) { fail(res, error); }
  },
  // GET: what the score likely holds, to confirm
  suggestions: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await scorePiecesService.suggest(id(req.params.id))); } catch (error) { fail(res, error); }
  },
  // GET: the score's page on IMSLP, for its PDF
  imslpPage: async (req: Request, res: Response): Promise<void> => {
    try { res.json({ page: await scorePiecesService.imslpPage(id(req.params.id)) }); } catch (error) { fail(res, error); }
  },
  // GET ?q=: a score to add, from a title or its ISMN
  lookup: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await scoreAddService.lookup(String(req.query.q || ''))); } catch (error) { fail(res, error); }
  },
  // POST: a score kept, with its pieces
  create: async (req: Request, res: Response): Promise<void> => {
    try { res.status(201).json(await scoreAddService.create(req.body || {})); } catch (error) { fail(res, error); }
  },
  // GET: a Henle score's page and level
  henle: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await scoreAddService.henleOf(id(req.params.id))); } catch (error) { fail(res, error); }
  },
  // GET ?q=: works to add
  search: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await scorePiecesService.searchPieces(String(req.query.q || ''))); } catch (error) { fail(res, error); }
  },
  // POST { image, mimeType }: a photo of the contents, read and matched
  contentsPhoto: async (req: Request, res: Response): Promise<void> => {
    try {
      const { image, mimeType } = req.body || {};
      if (typeof image !== 'string' || !image) { res.status(400).json({ error: 'A photo of the contents, please' }); return; }
      const { lines, truncated } = await coverScanService.transcribeScoreContents(image.replace(/^data:[^,]+,/, ''), mimeType || 'image/jpeg');
      res.json({ suggestions: await scorePiecesService.fromContents(id(req.params.id), lines), truncated });
    } catch (error) { fail(res, error); }
  },
  // POST: read the works of the recordings not indexed yet, in the background
  index: async (_req: Request, res: Response): Promise<void> => {
    scorePiecesService.indexAll()
      .then(result => logger.info(`Works of the recordings: ${result.recordings} on ${result.albums} albums`))
      .catch(error => logger.warn(`Works of the recordings not read: ${(error as Error).message}`));
    res.status(202).json({ started: true });
  },
  // GET: the scores holding what an album plays
  ofAlbum: async (req: Request, res: Response): Promise<void> => {
    try { res.json(await scorePiecesService.scoresOfAlbum(id(req.params.id))); } catch (error) { fail(res, error); }
  },
};

export default scorePiecesController;
