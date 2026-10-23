import Album from '../models/album';
import type { AlbumFormatted } from '../types';
import navidromeService from './navidromeService';
import ripStatusService from './ripStatusService';
import { normaliseAlbumQuery, takeBoolFilter } from '../utils/albumSearchFilters';

const favouriteAlbumService = {
  /** The albums of DexVault with at least one track hearted in Navidrome, by album id. */
  albumIds: async (): Promise<Set<number>> => {
    if (!navidromeService.isConfigured()) return new Set();
    const [starred, copies] = await Promise.all([navidromeService.getStarredSongAlbums(), ripStatusService.navidromeAlbums()]);
    return new Set([...copies].filter(([, copy]) => starred.has(copy.id)).map(([albumId]) => albumId));
  },

  /** The albums a query finds, `favourites:` asking Navidrome which have a hearted track. */
  search: async (query: string, options: { withNoCd?: boolean; mixtapes?: boolean } = {}): Promise<AlbumFormatted[]> => {
    // favourites:yes, the albums with a track hearted in Navidrome; favourites:no (or -favourites:yes), the others.
    // favorites: and fav: too, and true/false, with/without… (albumSearchFilters).
    const { allowed, rest } = takeBoolFilter(normaliseAlbumQuery(query), 'favourites');
    if (!allowed) return Album.search(query, options);
    if (allowed.length === 0) return [];
    if (allowed.length === 2) return Album.search(rest, options);
    const [albums, ids] = await Promise.all([Album.search(rest, options), favouriteAlbumService.albumIds()]);
    return albums.filter(album => ids.has(album.id) === allowed[0]);
  },
};

export default favouriteAlbumService;
