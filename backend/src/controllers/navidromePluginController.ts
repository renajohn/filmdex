import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import NavidromeListener, { type Favourite } from '../models/navidromeListener';
import logger from '../logger';

/** A Navidrome id: letters, digits, dashes and underscores, never a path. */
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;
const USER_NAME = /^[^\s/\\]{1,100}$/;
/** No play from before Navidrome's time or more than a day ahead of the clock. */
const EARLIEST = Date.UTC(2000, 0, 1) / 1000;

const tokenMatches = (given: string, expected: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const favouritesOf = (value: unknown): Favourite[] | null => {
  if (!Array.isArray(value)) return null;
  const items: Favourite[] = [];
  for (const item of value) {
    const { id, rating, starred } = (item || {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !ITEM_ID.test(id)) return null;
    const stars = Number(rating ?? 0);
    items.push({ id, rating: Number.isInteger(stars) && stars >= 0 && stars <= 5 ? stars : 0, starred: starred === true });
  }
  return items;
};

/**
 * What the DexVault plugin in Navidrome sends: every account's plays as they
 * happen, and each account's stars and hearts every hour. It proves itself
 * with NAVIDROME_PLUGIN_TOKEN, the same secret set in the plugin's settings.
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

  /** A play: { user, songId, playedAt } with playedAt in Unix seconds. */
  listen: async (req: Request, res: Response): Promise<void> => {
    const { user, songId, playedAt } = (req.body || {}) as Record<string, unknown>;
    const at = Number(playedAt);
    if (typeof user !== 'string' || !USER_NAME.test(user) || typeof songId !== 'string' || !ITEM_ID.test(songId)
      || !Number.isInteger(at) || at < EARLIEST || at > Date.now() / 1000 + 86400) {
      res.status(400).json({ error: 'Expected { user, songId, playedAt }' });
      return;
    }
    try {
      // NAVIDROME_USER's plays are counted from its own counters already: only kept here.
      const counted = user !== (process.env.NAVIDROME_USER || '');
      const added = await NavidromeListener.addListen(user, songId, at, counted);
      if (added && counted) logger.info(`Navidrome: a play by ${user} noted`);
      res.json({ ok: true, added, counted: added && counted });
    } catch (error) {
      logger.warn(`Noting a play by ${user}: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  /** An account's stars and hearts: { songs: [{ id, rating, starred }], albums: [...] }. */
  favourites: async (req: Request, res: Response): Promise<void> => {
    const user = String(req.params.user);
    const songs = favouritesOf(req.body?.songs);
    const albums = favouritesOf(req.body?.albums);
    if (!USER_NAME.test(user) || !songs || !albums) {
      res.status(400).json({ error: 'Expected { songs: [{ id, rating, starred }], albums: [...] }' });
      return;
    }
    try {
      // The Digital page weighs them each time it is asked for: nothing to refresh.
      await NavidromeListener.replaceFavourites(user, songs, albums);
      res.json({ ok: true, songs: songs.length, albums: albums.length });
    } catch (error) {
      logger.warn(`Noting the favourites of ${user}: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  },
};

export default navidromePluginController;
