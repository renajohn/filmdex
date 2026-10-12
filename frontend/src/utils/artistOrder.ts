import type { AlbumOrder } from './shelfLocations';

/** Articles a name is not filed under, as on the shelves: "The Beatles" at B. */
const ARTICLES = /^(the|a|an|le|la|les|l['’]|un|une|des|el|los|las|il|lo|gli)(\s+|(?<=['’]))/i;

/**
 * The key two names compare by, as the shelves have it: no accents, case or
 * punctuation, so "-M-" sorts with the M's and "Édith Piaf" with the E's.
 */
export const collationKey = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

interface Sortable { id: number | string; artist?: string[] | string; title?: string; releaseYear?: number | null }

const firstArtist = (album: Sortable): string =>
  (Array.isArray(album.artist) ? album.artist[0] : album.artist) || '';

/** The name a CD is filed under: the shelves' when known, else its artist without the article. */
export const artistSortName = (album: Sortable, order: Record<number, AlbumOrder>): string => {
  const shelved = order[Number(album.id)];
  if (shelved) return shelved.sortName;
  const artist = firstArtist(album).trim();
  return artist.replace(ARTICLES, '') || artist;
};

/** What orders a CD by artist: the shelves' key, then the year so a discography reads in order. */
export const artistSortKey = (album: Sortable, order: Record<number, AlbumOrder>): string =>
  order[Number(album.id)]?.key
  ?? [collationKey(artistSortName(album, order)), `${album.releaseYear || 9999} ${collationKey(album.title || '')}`].join('\u0001');

/** The letter of the index a CD falls under when sorted by artist: "#" for a digit. */
export const artistLetter = (album: Sortable, order: Record<number, AlbumOrder>): string => {
  const first = collationKey(artistSortName(album, order)).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
};
