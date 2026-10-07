import Album from '../models/album';
import navidromeService from './navidromeService';
import ripStatusService from './ripStatusService';
import logger from '../logger';

const SYNC_MS = 10 * 60 * 1000;

export type RatingSync = 'synced' | 'not_ripped' | 'not_configured' | 'failed';

/**
 * Which side's stars to keep when DexVault and Navidrome differ. `synced` is
 * what they last agreed on: the side still holding it has not moved, so the
 * other side's change wins. When both moved, or nothing was agreed yet and
 * both hold stars, Navidrome wins: it is where an album is rated while
 * listening, in Amperfy or the web player.
 */
export const reconcile = (dexvault: number | null, navidrome: number, synced: number | null):
  { keep: number; push: boolean } => {
  const mine = dexvault || 0;
  if (mine === navidrome) return { keep: navidrome, push: false };
  return navidrome === (synced || 0) ? { keep: mine, push: true } : { keep: navidrome, push: false };
};

/** Brings one album's stars in step with its copy in Navidrome. */
const apply = async (albumId: number, dexvault: number | null, synced: number | null, copy: { id: string; userRating: number }):
  Promise<'pulled' | 'pushed' | null> => {
  const { keep, push } = reconcile(dexvault, copy.userRating, synced);
  if (push) {
    await navidromeService.setRating(copy.id, keep);
    ripStatusService.noteRating(copy.id, keep);
  }
  if ((dexvault || 0) !== keep || (synced || 0) !== keep || synced === null) {
    await Album.setUserRating(albumId, keep || null, keep);
  }
  if (push) return 'pushed';
  return (dexvault || 0) !== keep ? 'pulled' : null;
};

const albumRatingService = {
  /** The owner's stars on a CD, given in Navidrome too when the CD is ripped. */
  setRating: async (albumId: number, rating: number): Promise<{ userRating: number | null; navidrome: RatingSync }> => {
    const stars = Math.max(0, Math.min(5, Math.round(rating)));
    await Album.setUserRating(albumId, stars || null);
    if (!navidromeService.isConfigured()) return { userRating: stars || null, navidrome: 'not_configured' };
    try {
      const copy = await ripStatusService.navidromeAlbumFor(albumId);
      if (!copy) return { userRating: stars || null, navidrome: 'not_ripped' };
      await navidromeService.setRating(copy.id, stars);
      ripStatusService.noteRating(copy.id, stars);
      await Album.setUserRating(albumId, stars || null, stars);
      return { userRating: stars || null, navidrome: 'synced' };
    } catch (error) {
      // Kept in DexVault: the next sync gives Navidrome the stars.
      logger.warn(`Album ${albumId}: could not give Navidrome its stars: ${(error as Error).message}`);
      return { userRating: stars || null, navidrome: 'failed' };
    }
  },

  /** One album, as its dialog opens: stars given in Amperfy show up at once. */
  syncAlbum: async (albumId: number): Promise<number | null> => {
    const album = await Album.findById(albumId);
    if (!album) return null;
    if (!navidromeService.isConfigured()) return album.userRating ?? null;
    const copy = await ripStatusService.navidromeAlbumFor(albumId);
    if (!copy) return album.userRating ?? null;
    const [row] = (await Album.findRatings()).filter(r => r.id === albumId);
    await apply(albumId, row?.userRating ?? null, row?.synced ?? null, copy);
    return (await Album.findById(albumId))?.userRating ?? null;
  },

  /** Every CD of the collection with a copy in Navidrome, both ways. */
  syncAll: async (): Promise<{ pulled: number; pushed: number }> => {
    const counts = { pulled: 0, pushed: 0 };
    if (!navidromeService.isConfigured()) return counts;
    ripStatusService.clearCache();
    const copies = await ripStatusService.navidromeAlbums();
    for (const row of await Album.findRatings()) {
      const copy = copies.get(row.id);
      if (!copy) continue;
      try {
        const done = await apply(row.id, row.userRating, row.synced, copy);
        if (done) counts[done]++;
      } catch (error) {
        logger.warn(`Album ${row.id}: stars not synced with Navidrome: ${(error as Error).message}`);
      }
    }
    if (counts.pulled || counts.pushed) logger.info(`Stars synced with Navidrome: ${counts.pulled} taken, ${counts.pushed} given`);
    return counts;
  },

  /** Every ten minutes, once the server has settled. */
  startSync: (): void => {
    if (!navidromeService.isConfigured()) return;
    const tick = () => { albumRatingService.syncAll().catch(error => logger.warn(`Stars sync with Navidrome failed: ${(error as Error).message}`)); };
    setTimeout(tick, 90 * 1000).unref();
    setInterval(tick, SYNC_MS).unref();
  },
};

export default albumRatingService;
