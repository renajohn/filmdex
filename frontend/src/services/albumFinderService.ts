/**
 * Finding an album as one types (backend albumFinderService): a store's
 * catalogue for the albums and their artists, MusicBrainz for the CD editions.
 */

export type FinderSource = 'itunes' | 'deezer';

export interface FinderAlbum {
  source: FinderSource;
  sourceId: string;
  title: string;
  artist: string;
  artistId: string;
  year: string | null;
  tracks: number | null;
  cover: string | null;
  /** How many of the catalogue's albums this one stands for (Deluxe, Remastered…). */
  editions: number;
  /** Already in DexVault: wished, or a CD of the collection. */
  have: { status: 'wish' | 'owned'; id: number } | null;
}

export interface FinderArtist {
  source: FinderSource;
  id: string;
  name: string;
  genre: string | null;
  covers: string[];
  albums: number;
}

export interface CdEdition {
  id: string;
  date: string | null;
  country: string | null;
  barcode: string | null;
  labels: string[];
  catalogNumbers: string[];
  packaging: string | null;
  disambiguation: string | null;
  status: string | null;
  formats: string[];
  discs: number;
  front: boolean;
}

export interface CdEditions {
  releaseGroup: { id: string; title: string; artist: string; firstReleaseDate: string | null } | null;
  editions: CdEdition[];
}

const get = async <T>(url: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(url, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || `HTTP error! status: ${response.status}`);
  return data as T;
};

const albumFinderService = {
  search: (q: string, signal?: AbortSignal) =>
    get<{ albums: FinderAlbum[]; artists: FinderArtist[]; source: FinderSource }>(`/api/music/finder/search?q=${encodeURIComponent(q)}`, signal),

  discography: (artist: Pick<FinderArtist, 'source' | 'id'>) =>
    get<FinderAlbum[]>(`/api/music/finder/artists/${artist.source}/${encodeURIComponent(artist.id)}/albums`),

  editions: (artist: string, title: string) =>
    get<CdEditions>(`/api/music/finder/editions?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`),

  /** An album without its edition: a wish, or a CD whose edition is told later. */
  addAlbum: async (album: Pick<FinderAlbum, 'title' | 'artist' | 'year' | 'cover'> & { titleStatus: 'wish' | 'owned'; releaseGroupId?: string | null }) => {
    const response = await fetch('/api/music/finder/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(album),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data as { error?: string }).error || `HTTP error! status: ${response.status}`);
    return data as { id: number; title: string };
  },
};

/** A small image of the catalogue's cover, for a list. */
export const coverAt = (url: string | null, size: number): string | null =>
  url ? url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`) : null;

export default albumFinderService;
