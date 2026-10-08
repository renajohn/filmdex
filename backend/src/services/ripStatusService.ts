import Album from '../models/album';
import type { AlbumFormatted } from '../types';
import navidromeService, { type NavidromeAlbum, type NavidromeSong } from './navidromeService';
import musicbrainzLinkService from './musicbrainzLinkService';
import musicbrainzService from './musicbrainzService';
import musicbrainzRefreshService from './musicbrainzRefreshService';
import ReleaseGroupLookup, { type ReleaseInfo } from '../models/releaseGroupLookup';
import musicService from './musicService';
import imageService from './imageService';
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

/**
 * What DexVault did with an edition found in a rip: took it for a CD of the
 * collection, moved the album off the wish list, or added the CD; or why it
 * left everything alone.
 */
export interface EditionAdoption {
  albumId: number | null;
  title: string;
  releaseId: string;
  action?: 'edition' | 'promoted' | 'added';
  previousReleaseId?: string | null;
  skipped?: 'no_release_group' | 'not_a_cd' | 'several_albums' | 'edition_taken' | 'failed';
}

/**
 * An album Navidrome has that no CD of the collection is: an old download or
 * a borrowed CD ripped long ago. It may already be on the wish list.
 */
export interface DigitalAlbum {
  navidromeId: string;
  name: string;
  artist: string;
  songCount: number;
  formats: string[];
  /** The wish list album standing for it, null when it is not wished. */
  wishAlbumId: number | null;
}

export interface RipStatus {
  configured: boolean;
  error?: string;
  counts: Record<RipState, number>;
  albums: RipStatusAlbum[];
  digital: DigitalAlbum[];
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

/** The release group of an edition and whether it is a CD, asked of MusicBrainz once and remembered. */
const releaseInfo = async (releaseId: string): Promise<ReleaseInfo> => {
  const known = await ReleaseGroupLookup.find(releaseId);
  if (known) return known;
  const release = await musicbrainzService.getReleaseDetails(releaseId);
  const media = release.media || [];
  const info = {
    releaseGroupId: release['release-group']?.id ?? null,
    isCd: media.length > 0 && media.every(medium => /CD/i.test(medium.format || '')),
  };
  await ReleaseGroupLookup.save(releaseId, info);
  return info;
};

/** The Navidrome albums that are this CD: same MusicBrainz edition, else same title and artist. */
const matchesOf = (album: AlbumFormatted, candidates: NavidromeAlbum[]): Array<{ candidate: NavidromeAlbum; match: RipMatch }> => {
  const variants = titleVariants(album.title);
  return candidates.flatMap(candidate => {
    if (album.musicbrainzReleaseId && candidate.musicBrainzId === album.musicbrainzReleaseId) {
      return [{ candidate, match: 'musicbrainz' as RipMatch }];
    }
    return variants.has(cleanTitle(candidate.name)) && sameArtist(album.artist, candidate.artist)
      ? [{ candidate, match: 'title' as RipMatch }] : [];
  });
};

const CACHE_MS = 60_000;
let cache: { at: number; albums: NavidromeAlbum[]; songs: NavidromeSong[] } | null = null;

const library = async (): Promise<{ albums: NavidromeAlbum[]; songs: NavidromeSong[] }> => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const [albums, songs] = await Promise.all([navidromeService.getAlbums(), navidromeService.getSongs()]);
  cache = { at: Date.now(), albums, songs };
  return cache;
};

/**
 * The copy of a CD in Navidrome whose cover and stars to take: the lossless
 * rip, the one tagged in Picard, before an old MP3.
 */
const bestCopy = (album: AlbumFormatted, navidrome: { albums: NavidromeAlbum[]; songs: NavidromeSong[] }): NavidromeAlbum | null => {
  const songsByAlbum = groupSongs(navidrome.songs);
  const matches = matchesOf(album, navidrome.albums)
    .sort((a, b) => Number(albumState(b.candidate, songsByAlbum) === 'lossless') - Number(albumState(a.candidate, songsByAlbum) === 'lossless')
      || Number(b.match === 'musicbrainz') - Number(a.match === 'musicbrainz'));
  return matches[0]?.candidate ?? null;
};

const byName = (a: { artist: string; name: string }, b: { artist: string; name: string }) =>
  a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name);

/** The Navidrome albums none of these CDs is, each with the wish list album that stands for it. */
const digitalOnly = (owned: AlbumFormatted[], wished: AlbumFormatted[], navidrome: { albums: NavidromeAlbum[]; songs: NavidromeSong[] }): DigitalAlbum[] => {
  const songsByAlbum = groupSongs(navidrome.songs);
  const ownedCopies = new Set(owned.flatMap(album => matchesOf(album, navidrome.albums).map(({ candidate }) => candidate.id)));
  return navidrome.albums
    .filter(album => !ownedCopies.has(album.id))
    .map(album => ({
      navidromeId: album.id,
      name: album.name,
      artist: album.artist,
      songCount: album.songCount,
      formats: [...new Set((songsByAlbum.get(album.id) || []).map(formatName))].sort(),
      wishAlbumId: wished.find(wish => matchesOf(wish, [album]).length > 0)?.id ?? null,
    }))
    .sort(byName);
};

/**
 * A wish list album for a digital one: its MusicBrainz edition when the files
 * carry one, else its title and artist with the cover Navidrome shows.
 */
const wishFor = async (album: NavidromeAlbum): Promise<AlbumFormatted> => {
  if (album.musicBrainzId) {
    try {
      return await musicService.addAlbumFromMusicBrainz(album.musicBrainzId, { titleStatus: 'wish' });
    } catch (error) {
      logger.warn(`Could not wish "${album.name}" from its edition ${album.musicBrainzId}: ${(error as Error).message}`);
    }
  }
  const added = await musicService.addAlbum({ title: album.name, artist: [album.artist], format: 'CD', titleStatus: 'wish' });
  try {
    const { data } = await navidromeService.getCoverArt(album.id);
    const filename = `navidrome_${added.id}_${Date.now()}.jpg`;
    const coverPath = await imageService.saveImage(data, 'cd/custom', filename);
    await Album.updateFrontCover(added.id, coverPath);
  } catch (error) {
    logger.warn(`Wished "${album.name}" without a cover: ${(error as Error).message}`);
  }
  return added;
};

const ripStatusService = {
  /** Forgets the library read from Navidrome, for a refresh right after a rip. */
  clearCache: (): void => { cache = null; },

  /**
   * Takes from the rips the edition Picard identified each CD as. A FLAC
   * album in Navidrome carries the MusicBrainz edition its files were tagged
   * with; when the collection does not have it, it goes to the album of the
   * same release group, the only one: a CD of the collection takes it in
   * place of the edition picked when it was added, an album of the wish list
   * also moves into the collection, and a CD DexVault does not know yet is
   * added. Tracks and credits then follow.
   */
  adoptEditions: async (): Promise<EditionAdoption[]> => {
    if (!navidromeService.isConfigured()) return [];
    const navidrome = await library();
    const songsByAlbum = groupSongs(navidrome.songs);
    // findAll is the collection only; the wish list comes on top.
    const all = [...await Album.findAll(), ...await Album.findByStatus('wish')];
    const known = new Set(all.filter(album => album.titleStatus !== 'wish').map(album => album.musicbrainzReleaseId).filter(Boolean));
    const refresh = (albumId: number, releaseId: string) => musicbrainzRefreshService.refreshAlbum(albumId).catch(error =>
      logger.warn(`Album ${albumId} took edition ${releaseId} but could not be refreshed: ${(error as Error).message}`));
    // Only a FLAC rip speaks for a CD: the rips of this workflow are FLAC,
    // while the library also holds older lossless copies (ALAC from iTunes,
    // tagged at some point) of CDs that may not be in the collection at all.
    const isFlacRip = (album: NavidromeAlbum) => {
      const songs = songsByAlbum.get(album.id) || [];
      return songs.length > 0 && songs.every(song => song.suffix === 'flac');
    };
    const editions = [...new Set(navidrome.albums
      .filter(album => album.musicBrainzId && !known.has(album.musicBrainzId) && isFlacRip(album))
      .map(album => album.musicBrainzId!))];

    const results: EditionAdoption[] = [];
    for (const releaseId of editions) {
      const name = navidrome.albums.find(album => album.musicBrainzId === releaseId)?.name || releaseId;
      try {
        const { releaseGroupId, isCd } = await releaseInfo(releaseId);
        if (!releaseGroupId) { results.push({ albumId: null, title: name, releaseId, skipped: 'no_release_group' }); continue; }
        const sameGroup = all.filter(album => album.musicbrainzReleaseGroupId === releaseGroupId);
        const inCollection = sameGroup.filter(album => album.titleStatus !== 'wish');
        const wished = sameGroup.filter(album => album.titleStatus === 'wish');
        if (inCollection.length > 1 || (inCollection.length === 0 && wished.length > 1)) {
          results.push({ albumId: null, title: name, releaseId, skipped: 'several_albums' });
          continue;
        }

        const [album] = inCollection.length === 1 ? inCollection : wished;
        if (!album) {
          // Not in DexVault at all: a CD ripped before being catalogued is added,
          // a download bought in lossless is not a CD of the collection.
          if (!isCd) { results.push({ albumId: null, title: name, releaseId, skipped: 'not_a_cd' }); continue; }
          const added = await musicService.addAlbumFromMusicBrainz(releaseId, { titleStatus: 'owned' } as never);
          logger.info(`Album ${added.id} "${added.title}" added from its rip, edition ${releaseId}`);
          results.push({ albumId: added.id, title: added.title, releaseId, action: 'added' });
          // A second rip of the same album, later in this run, finds it instead of adding it again.
          all.push({ ...added, musicbrainzReleaseGroupId: releaseGroupId, titleStatus: 'owned' });
          await refresh(added.id, releaseId);
          continue;
        }

        if (album.musicbrainzReleaseId !== releaseId) {
          try {
            await Album.replaceReleaseId(album.id, releaseId);
          } catch (error) {
            // The unique index: another album already has this edition.
            results.push({ albumId: album.id, title: album.title, releaseId, skipped: 'edition_taken' });
            continue;
          }
        }
        const promoted = album.titleStatus === 'wish';
        if (promoted) await Album.updateStatus(album.id, 'owned');
        logger.info(`Album ${album.id} "${album.title}" takes edition ${releaseId} from its rip (was ${album.musicbrainzReleaseId ?? 'none'})${promoted ? ', moved off the wish list' : ''}`);
        results.push({ albumId: album.id, title: album.title, releaseId, action: promoted ? 'promoted' : 'edition', previousReleaseId: album.musicbrainzReleaseId ?? null });
        await refresh(album.id, releaseId);
      } catch (error) {
        logger.warn(`Could not take the edition ${releaseId} found in Navidrome: ${(error as Error).message}`);
        results.push({ albumId: null, title: name, releaseId, skipped: 'failed' });
      }
    }
    return results;
  },

  /** The best copy of a CD in Navidrome, null when it has none. */
  navidromeAlbumFor: async (albumId: number): Promise<NavidromeAlbum | null> => {
    const album = await Album.findById(albumId);
    if (!album) return null;
    return bestCopy(album, await library());
  },

  /** The copy in Navidrome of every CD of the collection that has one, by album id. */
  navidromeAlbums: async (): Promise<Map<number, NavidromeAlbum>> => {
    const navidrome = await library();
    const copies = new Map<number, NavidromeAlbum>();
    for (const album of await Album.findAll()) {
      const copy = bestCopy(album, navidrome);
      if (copy) copies.set(album.id, copy);
    }
    return copies;
  },

  /** Keeps the library read a moment ago in step with stars DexVault just gave in Navidrome. */
  noteRating: (navidromeAlbumId: string, rating: number): void => {
    const album = cache?.albums.find(candidate => candidate.id === navidromeAlbumId);
    if (album) album.userRating = rating;
  },

  /**
   * Puts a digital album on the wish list, or takes it off: the wish list
   * albums standing for it are deleted. Null when Navidrome has no such album.
   */
  setWished: async (navidromeId: string, wished: boolean): Promise<DigitalAlbum | null> => {
    const navidrome = await library();
    const album = navidrome.albums.find(candidate => candidate.id === navidromeId);
    if (!album) return null;
    const standing = (await Album.findByStatus('wish')).filter(wish => matchesOf(wish, [album]).length > 0);
    if (wished && standing.length === 0) {
      const added = await wishFor(album);
      logger.info(`Album ${added.id} "${added.title}" wished from its digital copy in Navidrome`);
    }
    if (!wished) {
      for (const wish of standing) await musicService.deleteAlbum(wish.id);
    }
    return digitalOnly(await Album.findAll(), await Album.findByStatus('wish'), navidrome)
      .find(digital => digital.navidromeId === navidromeId) ?? null;
  },

  getStatus: async (): Promise<RipStatus> => {
    const counts: Record<RipState, number> = { none: 0, lossy: 0, lossless: 0 };
    const owned = (await Album.findAll()).filter(album => /CD|Unknown/i.test(album.format || 'Unknown'));

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
      const matches = matchesOf(album, navidrome.albums);

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

    const digital = digitalOnly(await Album.findAll(), await Album.findByStatus('wish'), navidrome);

    return { configured, ...(error ? { error } : {}), counts, albums, digital };
  },
};

export default ripStatusService;
