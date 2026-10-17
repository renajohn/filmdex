import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import NavidromeListener, { type EventType, type LibraryItem } from '../models/navidromeListener';
import logger from '../logger';

/** A Navidrome id: letters, digits, dashes and underscores, never a path. */
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;
const USER_NAME = /^[^\s/\\]{1,100}$/;
const EVENT_TYPES: EventType[] = ['scrobble', 'nowPlaying', 'playbackReport'];
/** No play from before Navidrome's time or more than a day ahead of the clock. */
const EARLIEST = Date.UTC(2000, 0, 1) / 1000;

const tokenMatches = (given: string, expected: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const itemsOf = (value: unknown): LibraryItem[] | null => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value.every(item => isRecord(item) && typeof item.id === 'string' && ITEM_ID.test(item.id)) ? value as LibraryItem[] : null;
};

/**
 * What the DexVault plugin in Navidrome hands on, as Navidrome told it:
 * every event of every account, and each account's library every hour.
 * DexVault keeps it all and draws from it what it counts. The plugin proves
 * itself with NAVIDROME_PLUGIN_TOKEN, the same secret set in its settings.
 */
const navidromePluginController = {
  authenticate: (req: Request, res: Response, next: NextFunction): void => {
    const expected = process.env.NAVIDROME_PLUGIN_TOKEN || '';
    if (!expected) {
      res.status(503).json({ error: 'Set NAVIDROME_PLUGIN_TOKEN in the DexVault stack to receive the plugin’s reports' });
      return;
    }
    const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!tokenMatches(given, expected)) {
      res.status(401).json({ error: 'Wrong token' });
      return;
    }
    next();
  },

  /**
   * An event: { type, data } with data as Navidrome gave it to the plugin,
   * { username, track: { id, … }, timestamp, … }. A scrobble is a play.
   */
  event: async (req: Request, res: Response): Promise<void> => {
    const { type, data } = (req.body || {}) as { type?: unknown; data?: unknown };
    const user = isRecord(data) ? data.username : undefined;
    const songId = isRecord(data) && isRecord(data.track) ? data.track.id : undefined;
    const stamp = isRecord(data) ? Number(data.timestamp) : NaN;
    const now = Math.floor(Date.now() / 1000);
    if (!EVENT_TYPES.includes(type as EventType) || typeof user !== 'string' || !USER_NAME.test(user)
      || (songId !== undefined && songId !== '' && (typeof songId !== 'string' || !ITEM_ID.test(songId)))) {
      res.status(400).json({ error: 'Expected { type, data: { username, track: { id }, timestamp } }' });
      return;
    }
    const song = typeof songId === 'string' && songId ? songId : null;
    const played = Number.isInteger(stamp) && stamp >= EARLIEST && stamp <= now + 86400;
    if (type === 'scrobble' && (!song || !played)) {
      res.status(400).json({ error: 'A scrobble needs its track id and timestamp' });
      return;
    }
    try {
      const at = played ? stamp : now;
      const added = await NavidromeListener.addEvent(type as EventType, user, song, at, data, now);
      if (type === 'scrobble' && added && await NavidromeListener.addListen(user, song!, at)) {
        logger.info(`Navidrome: a play by ${user} noted`);
      }
      res.json({ ok: true, added });
    } catch (error) {
      logger.warn(`Noting a Navidrome event of ${user}: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  /** The latest events the plugin handed on, newest first: ?limit= up to 500, 50 by default. */
  recent: async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit ?? '50'), 10) || 50));
    try {
      res.json({ events: await NavidromeListener.recentEvents(limit) });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  /** An account's library as it sees it: { user, songs, albums, artists }, each item as Navidrome gives it. */
  library: async (req: Request, res: Response): Promise<void> => {
    const user = String(req.params.user);
    const songs = itemsOf(req.body?.songs);
    const albums = itemsOf(req.body?.albums);
    const artists = itemsOf(req.body?.artists);
    if (!USER_NAME.test(user) || !songs || !albums || !artists) {
      res.status(400).json({ error: 'Expected { songs: [{ id, … }], albums: [...], artists: [...] }' });
      return;
    }
    try {
      // The Digital page weighs it each time it is asked for: nothing to refresh.
      await NavidromeListener.replaceLibrary(user, req.body?.user ?? null, { songs, albums, artists });
      res.json({ ok: true, songs: songs.length, albums: albums.length, artists: artists.length });
    } catch (error) {
      logger.warn(`Noting the library of ${user}: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  },
};

export default navidromePluginController;
