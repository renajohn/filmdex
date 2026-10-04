import Album from '../models/album';
import navidromeService, { type NavidromeAlbum, type NavidromeSong } from './navidromeService';
import musicbrainzLinkService from './musicbrainzLinkService';

/**
 * Where each CD of the collection stands in Navidrome:
 * - none:     not found in the library;
 * - lossy:    found, but some of its files are compressed (MP3, AAC);
 * - lossless: found, every file lossless (FLAC, ALAC, WAV, AIFF).
 * Every CD is to be ripped again to lossless, so "lossy" is still to do.
 */
export type RipState = 'none' | 'lossy' | 'lossless';
export type RipMatch = 'musicbrainz' | 'title';

export interface RipStatusAlbum {
  id: number;
  title: string;
  artist: string[];
  cover: string | null;
  musicbrainzReleaseId: string | null;
  state: RipState;
  formats: string[];
  matches: Array<{ name: string; artist: string; match: RipMatch; state: RipState }>;
}

export interface RipStatus {
  configured: boolean;
  error?: string;
  counts: Record<RipState, number>;
  albums: RipStatusAlbum[];
}

const LOSSLESS = new Set(['flac', 'alac', 'wav', 'aif', 'aiff', 'ape', 'wv']);

/** An .m4a is ALAC when Navidrome reports a bit depth, AAC otherwise. */
const isLossless = (song: NavidromeSong): boolean =>
  LOSSLESS.has(song.suffix) || (song.suffix === 'm4a' && Boolean(song.bitDepth));

const formatName = (song: NavidromeSong): string =>
  (song.suffix === 'm4a' ? (song.bitDepth ? 'alac' : 'aac') : song.suffix).toUpperCase();

/** "Abbey Road (Remastered 2009)" and "Abbey Road [Disc 1]" are Abbey Road. */
const cleanTitle = (title: string): string =>
  musicbrainzLinkService.normalize(title.replace(/[([][^)\]]*[)\]]/g, ' '));

/**
 * The names a CD may carry in its tags: Discogs titles join translations,
 * "Cellokonzerte • Cello Concertos", while a rip keeps one of them.
 */
const titleVariants = (title: string): Set<string> => {
  const parts = title.split(/\s+[•·=/]\s+/).map(cleanTitle).filter(part => part.length >= 4);
  return new Set([cleanTitle(title), ...parts].filter(Boolean));
};

const words = (text: string): string[] => musicbrainzLinkService.normalize(text).split(' ').filter(Boolean);

/**
 * One of the CD's artists is named by the tags, word for word in any order:
 * "Beatles, The" is The Beatles, "Mstislav Rostropovich; Paul Sacher" credits
 * Rostropovich.
 */
const sameArtist = (artists: string[], navidromeArtist: string): boolean => {
  const tagged = new Set(words(navidromeArtist));
  if (tagged.size === 0) return false;
  return artists.map(words).filter(list => list.length > 0).some(list =>
    list.every(word => tagged.has(word)) || [...tagged].every(word => list.includes(word)));
};

const CACHE_MS = 60_000;
let cache: { at: number; albums: NavidromeAlbum[]; songs: NavidromeSong[] } | null = null;

const library = async (): Promise<{ albums: NavidromeAlbum[]; songs: NavidromeSong[] }> => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const [albums, songs] = await Promise.all([navidromeService.getAlbums(), navidromeService.getSongs()]);
  cache = { at: Date.now(), albums, songs };
  return cache;
};

const ripStatusService = {
  /** Forgets the library read from Navidrome, for a refresh right after a rip. */
  clearCache: (): void => { cache = null; },

  getStatus: async (): Promise<RipStatus> => {
    const counts: Record<RipState, number> = { none: 0, lossy: 0, lossless: 0 };
    const owned = (await Album.findAll()).filter(album => album.titleStatus === 'owned' && /CD|Unknown/i.test(album.format || 'Unknown'));

    let navidrome: { albums: NavidromeAlbum[]; songs: NavidromeSong[] } = { albums: [], songs: [] };
    let error: string | undefined;
    const configured = navidromeService.isConfigured();
    if (configured) {
      try {
        navidrome = await library();
      } catch (e) {
        error = (e as Error).message;
      }
    }

    const songsByAlbum = new Map<string, NavidromeSong[]>();
    for (const song of navidrome.songs) songsByAlbum.set(song.albumId, [...(songsByAlbum.get(song.albumId) || []), song]);
    const stateOf = (album: NavidromeAlbum): RipState => {
      const songs = songsByAlbum.get(album.id) || [];
      return songs.length > 0 && songs.every(isLossless) ? 'lossless' : 'lossy';
    };

    const albums = owned.map(album => {
      const variants = titleVariants(album.title);
      const matches = navidrome.albums.flatMap(candidate => {
        if (album.musicbrainzReleaseId && candidate.musicBrainzId === album.musicbrainzReleaseId) {
          return [{ candidate, match: 'musicbrainz' as RipMatch }];
        }
        return variants.has(cleanTitle(candidate.name)) && sameArtist(album.artist, candidate.artist)
          ? [{ candidate, match: 'title' as RipMatch }] : [];
      });

      // A CD ripped again sits next to its old MP3 copy until that one is deleted: the best copy counts.
      const states = matches.map(({ candidate }) => stateOf(candidate));
      const state: RipState = states.includes('lossless') ? 'lossless' : states.length > 0 ? 'lossy' : 'none';
      counts[state]++;
      const formats = [...new Set(matches.flatMap(({ candidate }) => (songsByAlbum.get(candidate.id) || []).map(formatName)))].sort();

      return {
        id: album.id,
        title: album.title,
        artist: album.artist,
        cover: album.cover || null,
        musicbrainzReleaseId: album.musicbrainzReleaseId || null,
        state,
        formats,
        matches: matches.map(({ candidate, match }, index) => ({ name: candidate.name, artist: candidate.artist, match, state: states[index] })),
      };
    });

    return { configured, ...(error ? { error } : {}), counts, albums };
  },
};

export default ripStatusService;
