import { Request, Response } from 'express';
import remoteService, { validId, type RemoteCommand, type RemoteState } from '../services/remoteService';

const ACTIONS = new Set(['toggle', 'next', 'previous', 'listenNext', 'playAlbum']);

const text = (value: unknown, max: number): string => String(value ?? '').slice(0, max);
const count = (value: unknown): number => Math.max(0, Math.min(1e6, Number(value) || 0));

/** What a player says it plays, kept to what it should say: no field more, none too long. */
const stateOf = (body: Record<string, unknown>): RemoteState => {
  const album = body.album as Record<string, unknown> | null | undefined;
  const track = body.track as Record<string, unknown> | null | undefined;
  return {
    name: text(body.name || 'A browser', 40),
    playing: Boolean(body.playing),
    album: album && typeof album === 'object' ? {
      id: Number(album.id) || null, title: text(album.title, 200), artist: text(album.artist, 200),
      cover: album.cover ? text(album.cover, 500) : null,
    } : null,
    track: track && typeof track === 'object' ? { title: text(track.title, 200), disc: count(track.disc), no: count(track.no) } : null,
    index: count(body.index),
    count: count(body.count),
    position: count(body.position),
    duration: count(body.duration),
    error: body.error ? text(body.error, 200) : null,
  };
};

/** The player's id in the path, a browser's as it makes one; else 400. */
const idOf = (req: Request, res: Response): string | null => {
  const id = String(req.params.id);
  if (validId(id)) return id;
  res.status(400).json({ error: 'Which player?' });
  return null;
};

/** The remote for the music playing in a browser: what plays where, and commands to it. */
const remoteController = {
  // GET: the players heard of lately
  players: async (_req: Request, res: Response): Promise<void> => {
    try { res.json(await remoteService.list()); } catch (error) { res.status(500).json({ error: (error as Error).message }); }
  },
  // PUT { name }: a computer named as one knows it (empty: its browser's name again)
  rename: async (req: Request, res: Response): Promise<void> => {
    const id = idOf(req, res);
    if (!id) return;
    try {
      if (await remoteService.rename(id, String(req.body?.name || ''))) res.status(204).end();
      else res.status(404).json({ error: 'That computer is not there' });
    } catch (error) { res.status(500).json({ error: (error as Error).message }); }
  },
  // PUT: what a player plays now
  report: (req: Request, res: Response): void => {
    const id = idOf(req, res);
    if (!id) return;
    if (remoteService.report(id, stateOf((req.body || {}) as Record<string, unknown>))) res.status(204).end();
    else res.status(429).json({ error: 'Too many players' });
  },
  // GET: a player's commands, as Server-Sent Events
  commands: (req: Request, res: Response): void => {
    const id = idOf(req, res);
    if (!id) return;
    const stop = remoteService.listen(id, res);
    if (stop) req.on('close', stop);
    else res.status(429).json({ error: 'Too many players' });
  },
  // POST: a player saying it has a command
  acknowledge: (req: Request, res: Response): void => {
    res.status(remoteService.acknowledge(String(req.params.commandId)) ? 204 : 404).end();
  },
  // POST { action, albumId?, index?, disc? }: a command for a player, answered once it has it
  command: async (req: Request, res: Response): Promise<void> => {
    const id = idOf(req, res);
    if (!id) return;
    const body = req.body || {};
    if (!ACTIONS.has(body.action) || (body.action === 'playAlbum' && !Number(body.albumId))) {
      res.status(400).json({ error: 'Which command?' });
      return;
    }
    const command = (body.action === 'playAlbum'
      ? { action: 'playAlbum', albumId: Number(body.albumId), index: count(body.index), disc: count(body.disc) }
      : { action: body.action }) as RemoteCommand;
    const sent = await remoteService.send(id, command);
    if (sent === 'deaf') res.status(404).json({ error: 'That computer is not listening: its page is closed' });
    else if (sent === 'silent') res.status(504).json({ error: 'That computer does not answer: asleep, or its page closed' });
    else res.status(204).end();
  },
};

export default remoteController;
