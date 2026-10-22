import { Request, Response } from 'express';
import remoteService, { type RemoteCommand, type RemoteState } from '../services/remoteService';

const ACTIONS = new Set(['toggle', 'next', 'previous', 'listenNext', 'playAlbum']);

/** The remote for the music playing in a browser: what plays where, and commands to it. */
const remoteController = {
  // GET: the players heard of lately
  players: async (_req: Request, res: Response): Promise<void> => {
    try { res.json(await remoteService.list()); } catch (error) { res.status(500).json({ error: (error as Error).message }); }
  },
  // PUT { name }: a computer named as one knows it (empty: its browser's name again)
  rename: async (req: Request, res: Response): Promise<void> => {
    try { await remoteService.rename(String(req.params.id), String(req.body?.name || '')); res.status(204).end(); } catch (error) { res.status(500).json({ error: (error as Error).message }); }
  },
  // PUT: what a player plays now
  report: (req: Request, res: Response): void => {
    const body = (req.body || {}) as Partial<RemoteState>;
    remoteService.report(String(req.params.id), {
      name: String(body.name || 'A browser').slice(0, 60),
      playing: Boolean(body.playing),
      album: body.album || null,
      track: body.track || null,
      index: Number(body.index) || 0,
      count: Number(body.count) || 0,
      position: Number(body.position) || 0,
      duration: Number(body.duration) || 0,
    });
    res.status(204).end();
  },
  // GET: a player's commands, as Server-Sent Events
  commands: (req: Request, res: Response): void => {
    const stop = remoteService.listen(String(req.params.id), res);
    req.on('close', stop);
  },
  // POST { action, albumId?, index?, disc? }: a command for a player
  command: (req: Request, res: Response): void => {
    const body = req.body || {};
    if (!ACTIONS.has(body.action) || (body.action === 'playAlbum' && !Number(body.albumId))) {
      res.status(400).json({ error: 'Which command?' });
      return;
    }
    const command = (body.action === 'playAlbum'
      ? { action: 'playAlbum', albumId: Number(body.albumId), index: Number(body.index) || 0, disc: Number(body.disc) || 0 }
      : { action: body.action }) as RemoteCommand;
    if (!remoteService.send(String(req.params.id), command)) {
      res.status(404).json({ error: 'That player is not listening: its page is closed, or its computer asleep' });
      return;
    }
    res.status(204).end();
  },
};

export default remoteController;
