import Album from '../models/album';
import discogsService from './discogsService';
import musicbrainzService from './musicbrainzService';
import logger from '../logger';

export type LinkMethod = 'discogs_release' | 'discogs_master' | 'barcode' | 'title';

export interface LinkResult {
  releaseGroupId: string;
  method: LinkMethod;
}

export interface AlbumToLink {
  title: string;
  artist: string[];
  barcode?: string | null;
  discogsReleaseId?: string | null;
}

type Release = { id: string; title: string; barcode?: string; 'release-group'?: { id?: string }; 'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }> };

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

  /** Every album without a release group, one after the other: MusicBrainz allows one request a second. */
  linkAll: async (): Promise<Array<{ id: number; title: string; releaseGroupId: string | null; method: LinkMethod | null; error?: string }>> => {
    const albums = (await Album.findAll()).filter(album => !album.musicbrainzReleaseGroupId);
    const results = [];
    for (const album of albums) {
      try {
        const result = await musicbrainzLinkService.linkAlbum(album.id);
        results.push({ id: album.id, title: album.title, releaseGroupId: result?.releaseGroupId ?? null, method: result?.method ?? null });
      } catch (error) {
        results.push({ id: album.id, title: album.title, releaseGroupId: null, method: null, error: (error as Error).message });
      }
    }
    return results;
  },
};

export default musicbrainzLinkService;
