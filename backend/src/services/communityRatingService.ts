import Album from '../models/album';
import musicbrainzService from './musicbrainzService';
import discogsService from './discogsService';
import logger from '../logger';

/** Discogs allows 60 requests a minute and a refresh takes up to three. */
const DISCOGS_PAUSE_MS = 3000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface CommunityRatingResult {
  id: number;
  title: string;
  musicbrainz?: { value: number | null; votes: number };
  discogs?: { value: number | null; votes: number };
  errors: string[];
}

/** The Discogs pressing the album is, or the one MusicBrainz links its edition to. */
const discogsReleaseOf = (album: { discogsReleaseId?: string | null; urls?: Record<string, string> }): string | null =>
  album.discogsReleaseId || album.urls?.discogs?.match(/discogs\.com\/release\/(\d+)/)?.[1] || null;

const communityRatingService = {
  discogsReleaseOf,

  /**
   * Rereads both communities' ratings of one album. A source that fails keeps
   * what it had: one being down must not erase the other's votes.
   */
  refreshAlbum: async (albumId: number): Promise<CommunityRatingResult> => {
    const album = await Album.findById(albumId);
    if (!album) throw new Error('Album not found');
    const result: CommunityRatingResult = { id: albumId, title: album.title, errors: [] };
    const columns: Record<string, number | null> = {};

    if (album.musicbrainzReleaseGroupId) {
      try {
        result.musicbrainz = await musicbrainzService.getReleaseGroupRating(album.musicbrainzReleaseGroupId);
        columns.rating = result.musicbrainz.value == null ? null : Math.round(result.musicbrainz.value * 20) / 20;
        columns.rating_votes = result.musicbrainz.votes;
      } catch (error) {
        result.errors.push(`MusicBrainz: ${(error as Error).message}`);
      }
    }

    const discogsId = discogsReleaseOf(album);
    if (discogsId && discogsService.isConfigured()) {
      try {
        result.discogs = await discogsService.getCommunityRating(discogsId);
        columns.discogs_rating = result.discogs.value;
        columns.discogs_rating_votes = result.discogs.votes;
      } catch (error) {
        result.errors.push(`Discogs: ${(error as Error).message}`);
      }
    }

    await Album.setColumns(albumId, columns);
    return result;
  },

  /** Every album, one after the other for the two services' rate limits. */
  refreshAll: async (): Promise<CommunityRatingResult[]> => {
    const results: CommunityRatingResult[] = [];
    for (const album of await Album.findAll()) {
      try {
        results.push(await communityRatingService.refreshAlbum(album.id));
      } catch (error) {
        results.push({ id: album.id, title: album.title, errors: [(error as Error).message] });
      }
      if (discogsReleaseOf(album)) await sleep(DISCOGS_PAUSE_MS);
    }
    const failed = results.filter(result => result.errors.length > 0).length;
    logger.info(`Community ratings refreshed for ${results.length} albums, ${failed} with errors`);
    return results;
  },
};

export default communityRatingService;
