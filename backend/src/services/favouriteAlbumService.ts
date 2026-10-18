import Album from '../models/album';
import type { AlbumFormatted } from '../types';
import navidromeService from './navidromeService';
import ripStatusService from './ripStatusService';

/** favourites:yes, the albums with a track hearted in Navidrome; favourites:no, the others. */
const FAVOURITES = /(^|\s)favou?rites:(yes|no)\b/i;

const favouriteAlbumService = {
  /** The albums of DexVault with at least one track hearted in Navidrome, by album id. */
  albumIds: async (): Promise<Set<number>> => {
    if (!navidromeService.isConfigured()) return new Set();
    const [starred, copies] = await Promise.all([navidromeService.getStarredSongAlbums(), ripStatusService.navidromeAlbums()]);
    return new Set([...copies].filter(([, copy]) => starred.has(copy.id)).map(([albumId]) => albumId));
  },

  /** The albums a query finds, `favourites:` asking Navidrome which have a hearted track. */
  search: async (query: string, options: { withNoCd?: boolean; mixtapes?: boolean } = {}): Promise<AlbumFormatted[]> => {
    const favourites = query.match(FAVOURITES);
    if (!favourites) return Album.search(query, options);
    const [albums, ids] = await Promise.all([
      Album.search(query.replace(favourites[0], ' ').replace(/\s+/g, ' ').trim(), options),
      favouriteAlbumService.albumIds(),
    ]);
    const want = favourites[2].toLowerCase() === 'yes';
    return albums.filter(album => ids.has(album.id) === want);
  },
};

export default favouriteAlbumService;
