import Album from '../models/album';
import navidromeService, { type NavidromeAlbum, type NavidromeSong } from './navidromeService';
import musicbrainzLinkService from './musicbrainzLinkService';
import musicbrainzService from './musicbrainzService';
import musicbrainzRefreshService from './musicbrainzRefreshService';
import ReleaseGroupLookup from '../models/releaseGroupLookup';
import logger from '../logger';

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

/** An edition DexVault took from a rip, or why it left the album alone. */
export interface EditionAdoption {
  albumId: number | null;
  title: string;
  releaseId: string;
  previousReleaseId?: string | null;
  skipped?: 'no_release_group' | 'no_album' | 'several_albums' | 'edition_taken' | 'failed';
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

const groupSongs = (songs: NavidromeSong[]): Map<string, NavidromeSong[]> => {
  const byAlbum = new Map<string, NavidromeSong[]>();
  for (const song of songs) byAlbum.set(song.albumId, [...(byAlbum.get(song.albumId) || []), song]);
  return byAlbum;
};

const albumState = (album: NavidromeAlbum, songsByAlbum: Map<string, NavidromeSong[]>): RipState => {
  const songs = songsByAlbum.get(album.id) || [];
  return songs.length > 0 && songs.every(isLossless) ? 'lossless' : 'lossy';
};

/** The release group of an edition, asked of MusicBrainz once and remembered. */
const releaseGroupOf = async (releaseId: string): Promise<string | null> => {
  const known = await ReleaseGroupLookup.find(releaseId);
  if (known !== undefined) return known;
  const release = await musicbrainzService.getReleaseDetails(releaseId);
  const releaseGroupId = release['release-group']?.id ?? null;
  await ReleaseGroupLookup.save(releaseId, releaseGroupId);
  return releaseGroupId;
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

  /**
   * Takes from the rips the edition Picard identified each CD as. A lossless
   * album in Navidrome carries the MusicBrainz edition its files were tagged
   * with; when DexVault does not know it, it belongs to the CD of the
   * collection with the same release group, the only one, and replaces the
   * edition picked when the album was added. Tracks and credits then follow.
   */
  adoptEditions: async (): Promise<EditionAdoption[]> => {
    if (!navidromeService.isConfigured()) return [];
    const navidrome = await library();
    const songsByAlbum = groupSongs(navidrome.songs);
    const owned = (await Album.findAll()).filter(album => album.titleStatus === 'owned');
    const known = new Set(owned.map(album => album.musicbrainzReleaseId).filter(Boolean));
    const editions = [...new Set(navidrome.albums
      .filter(album => album.musicBrainzId && !known.has(album.musicBrainzId) && albumState(album, songsByAlbum) === 'lossless')
      .map(album => album.musicBrainzId!))];

    const results: EditionAdoption[] = [];
    for (const releaseId of editions) {
      const name = navidrome.albums.find(album => album.musicBrainzId === releaseId)?.name || releaseId;
      try {
        const releaseGroupId = await releaseGroupOf(releaseId);
        if (!releaseGroupId) { results.push({ albumId: null, title: name, releaseId, skipped: 'no_release_group' }); continue; }
        const candidates = owned.filter(album => album.musicbrainzReleaseGroupId === releaseGroupId);
        if (candidates.length !== 1) {
          results.push({ albumId: null, title: name, releaseId, skipped: candidates.length === 0 ? 'no_album' : 'several_albums' });
          continue;
        }
        const [album] = candidates;
        try {
          await Album.replaceReleaseId(album.id, releaseId);
        } catch (error) {
          // The unique index: another album of the collection already has this edition.
          results.push({ albumId: album.id, title: album.title, releaseId, skipped: 'edition_taken' });
          continue;
        }
        logger.info(`Album ${album.id} "${album.title}" takes edition ${releaseId} from its rip (was ${album.musicbrainzReleaseId ?? 'none'})`);
        results.push({ albumId: album.id, title: album.title, releaseId, previousReleaseId: album.musicbrainzReleaseId ?? null });
        await musicbrainzRefreshService.refreshAlbum(album.id).catch(error =>
          logger.warn(`Album ${album.id} took edition ${releaseId} but could not be refreshed: ${(error as Error).message}`));
      } catch (error) {
        logger.warn(`Could not look up the edition ${releaseId} found in Navidrome: ${(error as Error).message}`);
        results.push({ albumId: null, title: name, releaseId, skipped: 'failed' });
      }
    }
    return results;
  },

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

    const songsByAlbum = groupSongs(navidrome.songs);
    const stateOf = (album: NavidromeAlbum) => albumState(album, songsByAlbum);

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
