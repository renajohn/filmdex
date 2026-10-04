import Album from '../models/album';
import discogsService from './discogsService';
import musicbrainzService from './musicbrainzService';
import logger from '../logger';

export type LinkMethod = 'discogs_release' | 'discogs_master' | 'barcode' | 'title';
export type ReleaseLinkMethod = 'discogs_release' | 'barcode' | 'catalog_number';

export interface LinkResult {
  releaseGroupId: string;
  method: LinkMethod;
}

export interface ReleaseLinkResult {
  releaseId: string;
  releaseGroupId: string | null;
  method: ReleaseLinkMethod;
}

export interface AlbumToLink {
  title: string;
  artist: string[];
  barcode?: string | null;
  catalogNumber?: string | null;
  labels?: string[];
  discogsReleaseId?: string | null;
  musicbrainzReleaseGroupId?: string | null;
}

export interface LinkAllResult {
  id: number;
  title: string;
  releaseGroupId: string | null;
  method: LinkMethod | null;
  releaseId: string | null;
  releaseMethod: ReleaseLinkMethod | null;
  error?: string;
}

type Release = {
  id: string;
  title: string;
  barcode?: string;
  'release-group'?: { id?: string };
  'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }>;
  'label-info'?: Array<{ 'catalog-number'?: string; label?: { name?: string } }>;
  media?: Array<{ format?: string }>;
};

/** "MADAMA BUTTERFLY" and "Madama Butterfly", "Händel" and "Handel" compare equal. */
const normalize = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const digits = (barcode: string): string => barcode.replace(/\D/g, '').replace(/^0+/, '');

/** The single release group the candidates agree on, or null when there is none or several. */
const onlyReleaseGroup = (releases: Release[]): string | null => {
  const groups = new Set(releases.map(release => release['release-group']?.id).filter((id): id is string => Boolean(id)));
  return groups.size === 1 ? [...groups][0] : null;
};

const fromDiscogsRelease = async (discogsReleaseId: string): Promise<string | null> => {
  const { releaseIds } = await musicbrainzService.findByDiscogsUrl(`https://www.discogs.com/release/${discogsReleaseId}`);
  if (releaseIds.length === 0) return null;
  const release = await musicbrainzService.getReleaseDetails(releaseIds[0]);
  return release['release-group']?.id ?? null;
};

/** The master groups every pressing of an album, and is what MusicBrainz links most often. */
const fromDiscogsMaster = async (discogsReleaseId: string): Promise<string | null> => {
  if (!discogsService.isConfigured()) return null;
  const masterId = (await discogsService.getRelease(discogsReleaseId)).master_id;
  if (!masterId) return null;
  const { releaseGroupIds } = await musicbrainzService.findByDiscogsUrl(`https://www.discogs.com/master/${masterId}`);
  return releaseGroupIds.length === 1 ? releaseGroupIds[0] : null;
};

const fromBarcode = async (barcode: string): Promise<string | null> => {
  const wanted = digits(barcode);
  if (wanted.length < 8) return null;
  const releases = await musicbrainzService.searchRelease(`barcode:${wanted}`, 25) as Release[];
  return onlyReleaseGroup(releases.filter(release => release.barcode && digits(release.barcode) === wanted));
};

/**
 * Last resort, and deliberately strict: the title must be the same once
 * normalised, and the credits must share at least half of the album's artists
 * (and two when it has several). Recordings of the same opera share the
 * composer and often a singer or the orchestra, so the album that shares the
 * most must also share strictly more than any other.
 */
const fromTitle = async (title: string, artists: string[]): Promise<string | null> => {
  if (!title.trim() || artists.length === 0) return null;
  const quote = (text: string) => `"${text.replace(/["\\]/g, ' ')}"`;
  const query = `release:${quote(title)} AND (${artists.map(artist => `artist:${quote(artist)}`).join(' OR ')})`;
  const releases = await musicbrainzService.searchRelease(query, 25) as Release[];

  const wantedArtists = new Set(artists.map(normalize));
  const needed = Math.max(Math.min(2, wantedArtists.size), Math.ceil(wantedArtists.size / 2));
  const sharedByGroup = new Map<string, number>();
  for (const release of releases) {
    const releaseGroupId = release['release-group']?.id;
    if (!releaseGroupId || normalize(release.title) !== normalize(title)) continue;
    const credited = new Set((release['artist-credit'] || []).map(credit => normalize(credit.artist?.name || credit.name || '')));
    const shared = [...wantedArtists].filter(name => credited.has(name)).length;
    sharedByGroup.set(releaseGroupId, Math.max(shared, sharedByGroup.get(releaseGroupId) ?? 0));
  }

  const ranked = [...sharedByGroup.entries()].sort((a, b) => b[1] - a[1]);
  const [best, runnerUp] = ranked;
  if (!best || best[1] < needed || (runnerUp && runnerUp[1] === best[1])) return null;
  return best[0];
};

/** "429 098-2" and "4290982" are the same catalogue number. */
const catalogKey = (text: string): string => text.toLowerCase().replace(/[\s\-./]/g, '');

/**
 * Reissues and digital editions often reuse the CD's barcode: only CDs are
 * candidates. A release whose media formats are unknown is kept, MusicBrainz
 * leaves the format blank on many old entries.
 */
const isCd = (release: Release): boolean =>
  !release.media?.length || release.media.every(medium => !medium.format || /CD/i.test(medium.format));

const sameLabel = (labels: string[], release: Release): boolean => {
  const wanted = labels.map(normalize).filter(Boolean);
  return (release['label-info'] || []).some(info => {
    const name = normalize(info.label?.name || '');
    return Boolean(name) && wanted.some(label => label.includes(name) || name.includes(label));
  });
};

/** The one edition left, or null when there is none or several. */
const onlyRelease = (releases: Release[]): Release | null => (releases.length === 1 ? releases[0] : null);

const releaseFromDiscogs = async (discogsReleaseId: string): Promise<Release | null> => {
  const { releaseIds } = await musicbrainzService.findByDiscogsUrl(`https://www.discogs.com/release/${discogsReleaseId}`);
  if (releaseIds.length !== 1) return null;
  const release = await musicbrainzService.getReleaseDetails(releaseIds[0]);
  return { ...release, id: releaseIds[0] } as Release;
};

const releaseFromBarcode = async (barcode: string): Promise<Release | null> => {
  const wanted = digits(barcode);
  if (wanted.length < 8) return null;
  const releases = await musicbrainzService.searchRelease(`barcode:${wanted}`, 25) as Release[];
  return onlyRelease(releases.filter(release => release.barcode && digits(release.barcode) === wanted && isCd(release)));
};

/**
 * Catalogue numbers are short and labels reuse each other's patterns ("CD-210"
 * exists at a dozen labels), so the label must agree too, unless the release
 * group already known vouches for the edition.
 */
const releaseFromCatalogNumber = async (album: AlbumToLink): Promise<Release | null> => {
  const wanted = catalogKey(album.catalogNumber || '');
  if (wanted.length < 4) return null;
  const query = `catno:"${album.catalogNumber!.replace(/["\\]/g, ' ')}"`;
  const releases = await musicbrainzService.searchRelease(query, 25) as Release[];
  return onlyRelease(releases.filter(release =>
    isCd(release)
    && (release['label-info'] || []).some(info => catalogKey(info['catalog-number'] || '') === wanted)
    && (release['release-group']?.id === album.musicbrainzReleaseGroupId || sameLabel(album.labels || [], release))
  ));
};

const musicbrainzLinkService = {
  normalize,

  /** Tries the sources from the most to the least certain and stops at the first answer. */
  findReleaseGroup: async (album: AlbumToLink): Promise<LinkResult | null> => {
    const attempts: Array<[LinkMethod, () => Promise<string | null>]> = [];
    if (album.discogsReleaseId) {
      attempts.push(['discogs_release', () => fromDiscogsRelease(album.discogsReleaseId!)]);
      attempts.push(['discogs_master', () => fromDiscogsMaster(album.discogsReleaseId!)]);
    }
    if (album.barcode) attempts.push(['barcode', () => fromBarcode(album.barcode!)]);
    attempts.push(['title', () => fromTitle(album.title, album.artist)]);

    for (const [method, attempt] of attempts) {
      const releaseGroupId = await attempt();
      if (releaseGroupId) return { releaseGroupId, method };
    }
    return null;
  },

  /**
   * The exact edition: Discogs's own link first, then the barcode, then the
   * catalogue number. Only a single CD answer counts, and it must belong to
   * the release group the album already has, if any.
   */
  findRelease: async (album: AlbumToLink): Promise<ReleaseLinkResult | null> => {
    const attempts: Array<[ReleaseLinkMethod, () => Promise<Release | null>]> = [];
    if (album.discogsReleaseId) attempts.push(['discogs_release', () => releaseFromDiscogs(album.discogsReleaseId!)]);
    if (album.barcode) attempts.push(['barcode', () => releaseFromBarcode(album.barcode!)]);
    if (album.catalogNumber) attempts.push(['catalog_number', () => releaseFromCatalogNumber(album)]);

    for (const [method, attempt] of attempts) {
      const release = await attempt();
      if (!release) continue;
      const releaseGroupId = release['release-group']?.id ?? null;
      if (album.musicbrainzReleaseGroupId && releaseGroupId !== album.musicbrainzReleaseGroupId) continue;
      return { releaseId: release.id, releaseGroupId, method };
    }
    return null;
  },

  /** Links one album to its exact edition, and to the release group that comes with it. */
  linkRelease: async (albumId: number): Promise<ReleaseLinkResult | null> => {
    const album = await Album.findById(albumId);
    if (!album || album.musicbrainzReleaseId) return null;
    const result = await musicbrainzLinkService.findRelease(album as AlbumToLink);
    if (result) {
      await Album.setReleaseId(albumId, result.releaseId);
      if (result.releaseGroupId) await Album.setReleaseGroupId(albumId, result.releaseGroupId);
      logger.info(`Album ${albumId} "${album.title}" linked to MusicBrainz release ${result.releaseId} by ${result.method}`);
    }
    return result;
  },

  /** Links one album that has no release group yet, and keeps what was found. */
  linkAlbum: async (albumId: number): Promise<LinkResult | null> => {
    const album = await Album.findById(albumId);
    if (!album || album.musicbrainzReleaseGroupId) return null;
    const result = await musicbrainzLinkService.findReleaseGroup(album as AlbumToLink);
    if (result) {
      await Album.setReleaseGroupId(albumId, result.releaseGroupId);
      logger.info(`Album ${albumId} "${album.title}" linked to MusicBrainz release group ${result.releaseGroupId} by ${result.method}`);
    }
    return result;
  },

  /**
   * Every album missing its edition or its release group, one after the other:
   * MusicBrainz allows one request a second. The edition comes first, since it
   * brings its release group with more certainty than a search by title.
   */
  linkAll: async (): Promise<LinkAllResult[]> => {
    const albums = (await Album.findAll()).filter(album => !album.musicbrainzReleaseId || !album.musicbrainzReleaseGroupId);
    const results: LinkAllResult[] = [];
    for (const album of albums) {
      const entry: LinkAllResult = { id: album.id, title: album.title, releaseGroupId: null, method: null, releaseId: null, releaseMethod: null };
      try {
        const release = await musicbrainzLinkService.linkRelease(album.id);
        entry.releaseId = release?.releaseId ?? null;
        entry.releaseMethod = release?.method ?? null;
        // A release group that came with the edition is reported by releaseMethod.
        if (!album.musicbrainzReleaseGroupId) entry.releaseGroupId = release?.releaseGroupId ?? null;
        const group = await musicbrainzLinkService.linkAlbum(album.id);
        if (group) {
          entry.releaseGroupId = group.releaseGroupId;
          entry.method = group.method;
        }
      } catch (error) {
        entry.error = (error as Error).message;
      }
      results.push(entry);
    }
    return results;
  },
};

export default musicbrainzLinkService;
