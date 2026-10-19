import Album from '../models/album';
import musicbrainzService from './musicbrainzService';
import discogsService from './discogsService';
import searchCoverService from './searchCoverService';
import { downloadCover, isTrustedCoverUrl } from './musicService';
import logger from '../logger';

/**
 * The covers an album missing one can take, to choose from as when a CD is
 * added: Cover Art Archive's for this edition and the others of its release
 * group, Discogs' for the release and its master, Deezer's for the front.
 */

export type CoverSide = 'front' | 'back';

export interface CoverCandidate {
  /** The image to keep, 1200 px at most. */
  url: string;
  /** A smaller one for the thumbnail. */
  thumbnail: string;
  /** Where it comes from: "This edition", "Other edition", "Discogs", "Discogs master", "Deezer". */
  source: string;
  country: string | null;
  year: string | null;
  catalogNumber: string | null;
}

/** Cover Art Archive answers late at times: past this, an edition is left out. */
const CAA_TIMEOUT_MS = 8000;
/** Editions asked of Cover Art Archive, this one first, then those of the same format. */
const MAX_EDITIONS = 12;
/** Discogs types no image as the back: its secondary images are all offered, up to this. */
const MAX_DISCOGS_BACKS = 8;

const https = (url: string): string => url.replace(/^http:\/\//, 'https://');

const discogsIdOf = (album: { discogsReleaseId?: string | null; urls?: Record<string, string> }): string | null =>
  album.discogsReleaseId || album.urls?.discogs?.match(/discogs\.com\/release\/(\d+)/)?.[1] || null;

const fromCoverArtArchive = async (
  album: { musicbrainzReleaseId: string | null; musicbrainzReleaseGroupId: string | null; format: string | null },
  side: CoverSide
): Promise<CoverCandidate[]> => {
  if (!album.musicbrainzReleaseGroupId) {
    if (!album.musicbrainzReleaseId) return [];
    const art = await musicbrainzService.fetchCoverArt(`release/${album.musicbrainzReleaseId}`, CAA_TIMEOUT_MS);
    const image = art?.[side];
    return image ? [{ url: https(image.url), thumbnail: https(image.thumbnails?.['500'] || image.url), source: 'This edition', country: null, year: null, catalogNumber: null }] : [];
  }

  let editions: Awaited<ReturnType<typeof musicbrainzService.getReleasesOfGroup>>;
  try {
    editions = await musicbrainzService.getReleasesOfGroup(album.musicbrainzReleaseGroupId);
  } catch (error) {
    logger.warn(`Could not list the editions of ${album.musicbrainzReleaseGroupId}: ${(error as Error).message}`);
    return [];
  }
  const rank = (edition: typeof editions[number]): number =>
    edition.id === album.musicbrainzReleaseId ? 0 : edition.format && edition.format === album.format ? 1 : 2;
  const chosen = editions
    .filter(edition => edition[side])
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_EDITIONS);

  const found = await Promise.all(chosen.map(async edition => {
    const art = await musicbrainzService.fetchCoverArt(`release/${edition.id}`, CAA_TIMEOUT_MS);
    const image = art?.[side];
    if (!image) return null;
    return {
      url: https(image.thumbnails?.['1200'] || image.url),
      thumbnail: https(image.thumbnails?.['500'] || image.thumbnails?.['250'] || image.url),
      source: edition.id === album.musicbrainzReleaseId ? 'This edition' : 'Other edition',
      country: edition.country,
      year: edition.date?.slice(0, 4) || null,
      catalogNumber: edition.catalogNumber,
    };
  }));
  return found.filter((candidate): candidate is CoverCandidate => candidate !== null);
};

const fromDiscogs = async (
  album: { discogsReleaseId?: string | null; urls?: Record<string, string> },
  side: CoverSide
): Promise<CoverCandidate[]> => {
  const discogsId = discogsIdOf(album);
  if (!discogsId || !discogsService.isConfigured()) return [];
  try {
    const release = await discogsService.getRelease(discogsId);
    const images = (release.images || []).filter(image => image.uri);
    const of = (uri: string, source: string): CoverCandidate => ({
      url: uri, thumbnail: uri, source,
      country: release.country || null,
      year: release.year ? String(release.year) : null,
      catalogNumber: release.labels?.[0]?.catno || null,
    });
    if (side === 'back') {
      return images.filter(image => image.type === 'secondary').slice(0, MAX_DISCOGS_BACKS).map(image => of(image.uri!, 'Discogs'));
    }
    const primary = images.filter(image => image.type === 'primary').map(image => of(image.uri!, 'Discogs'));
    const master = await discogsService.getMasterCoverArt(release.master_id);
    return master ? [...primary, { ...of(master, 'Discogs master'), country: null, catalogNumber: null }] : primary;
  } catch (error) {
    logger.warn(`Could not read Discogs release ${discogsId} for covers: ${(error as Error).message}`);
    return [];
  }
};

const albumCoverService = {
  /** Every cover found for that side, this edition's first, each image once. */
  candidates: async (albumId: number, side: CoverSide): Promise<CoverCandidate[] | null> => {
    const album = await Album.findById(albumId);
    if (!album) return null;
    const [archive, discogs, deezer] = await Promise.all([
      fromCoverArtArchive(album, side),
      fromDiscogs(album, side),
      side === 'front'
        ? searchCoverService.deezerCover(album.artist?.[0] || '', album.title || '')
        : Promise.resolve(null),
    ]);
    const all: CoverCandidate[] = [
      ...archive,
      ...discogs,
      ...(deezer ? [{ url: deezer, thumbnail: deezer, source: 'Deezer', country: null, year: null, catalogNumber: null }] : []),
    ];
    return all.filter((candidate, index) => all.findIndex(other => other.url === candidate.url) === index);
  },

  /** Downloads the cover chosen and makes it that side of the album: its path, or an error to tell. */
  useCover: async (albumId: number, side: CoverSide, url: string): Promise<string> => {
    if (!isTrustedCoverUrl(url)) throw Object.assign(new Error('This image comes from a site DexVault does not take covers from'), { status: 400 });
    const album = await Album.findById(albumId);
    if (!album) throw Object.assign(new Error('Album not found'), { status: 404 });
    const coverPath = await downloadCover(url, String(albumId), side);
    if (!coverPath) throw Object.assign(new Error('The image could not be downloaded'), { status: 502 });
    if (side === 'front') await Album.updateFrontCover(albumId, coverPath);
    else await Album.updateBackCover(albumId, coverPath);
    return coverPath;
  },
};

export default albumCoverService;
