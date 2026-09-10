import axios, { AxiosResponse } from 'axios';
import { durationToSeconds } from '../utils/duration';
import configManager from '../config';
import logger from '../logger';

/**
 * Discogs is the reference database for physical pressings: it knows editions,
 * barcodes, catalogue numbers and label variants that MusicBrainz often lacks,
 * and it has been far more reliable in practice.
 *
 * Requires a personal access token (DISCOGS_TOKEN), free to generate at
 * discogs.com/settings/developers.
 */

const BASE_URL = 'https://api.discogs.com';
/** Discogs rejects requests without a descriptive User-Agent. */
const USER_AGENT = 'DexVault/1.0 +https://github.com/renajohn/filmdex';
const TIMEOUT_MS = 10000;

export interface DiscogsSearchHit {
  id: number;
  title?: string;
  year?: string;
  country?: string;
  format?: string[];
  label?: string[];
  catno?: string;
  barcode?: string[];
  cover_image?: string;
}

interface DiscogsTrack {
  position?: string;
  title?: string;
  duration?: string;
  type_?: string;
}

export interface DiscogsRelease {
  id: number;
  master_id?: number;
  title?: string;
  artists?: Array<{ name?: string }>;
  year?: number;
  released?: string;
  country?: string;
  labels?: Array<{ name?: string; catno?: string }>;
  formats?: Array<{ name?: string; qty?: string; descriptions?: string[] }>;
  identifiers?: Array<{ type?: string; value?: string }>;
  tracklist?: DiscogsTrack[];
  images?: Array<{ type?: string; uri?: string }>;
  genres?: string[];
  styles?: string[];
  notes?: string;
}

export interface FormattedDiscogsRelease {
  discogsReleaseId: string;
  /** The master groups every pressing; it usually carries artwork when a
   *  specific pressing does not. */
  masterId: number | null;
  musicbrainzReleaseId: null;
  title: string;
  artist: string[];
  releaseYear: number | null;
  country: string | null;
  format: string;
  labels: string[];
  catalogNumber: string | null;
  barcode: string | null;
  genres: string[];
  editionNotes: string | null;
  status: string;
  coverArt: { front: string | null; back: string | null };
  discs: Array<{
    number: number;
    tracks: Array<{ trackNumber: number; title: string; durationSec: number | null }>;
  }>;
  discCount: number;
  totalDuration: number | null;
}

const getToken = (): string | null => {
  // Read the environment directly first: getApiKeys() throws until the data
  // config has been loaded, which would hide a perfectly valid token.
  if (process.env.DISCOGS_TOKEN) return process.env.DISCOGS_TOKEN;

  try {
    return configManager.getApiKeys().discogs || null;
  } catch (_) {
    return null;
  }
};

export const isConfigured = (): boolean => Boolean(getToken());

const request = async <T>(path: string, params: Record<string, unknown>): Promise<T> => {
  const token = getToken();
  if (!token) {
    throw new Error('Discogs is not configured: set DISCOGS_TOKEN to enable it');
  }

  try {
    const response: AxiosResponse<T> = await axios.get(`${BASE_URL}${path}`, {
      params,
      // Header rather than a ?token= query param: the query string ends up in
      // access logs, error messages and stack traces.
      headers: {
        'User-Agent': USER_AGENT,
        Authorization: `Discogs token=${token}`
      },
      timeout: TIMEOUT_MS
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 429) {
        throw new Error('Discogs rate limit reached. Please try again in a moment.');
      }
      if (status === 401 || status === 403) {
        throw new Error('Discogs rejected the token. Check DISCOGS_TOKEN.');
      }
      // Never surface the raw axios error: it carries the request config.
      throw new Error(`Discogs request failed${status ? ` (HTTP ${status})` : ''}`);
    }
    throw error;
  }
};



/**
 * Discogs positions are "1", "A1" for vinyl sides, "2-5" on multi-disc sets, or
 * "CD2-5" when the label prefixes the medium. Returns the disc and the track
 * number within it; formatRelease renumbers a disc whose numbers still collide.
 */
const parsePosition = (position: string | undefined, fallbackIndex: number): { disc: number; track: number } => {
  const raw = (position || '').trim();

  // "2-5" and "2.5", with an optional medium prefix such as "CD2-5".
  const multiDisc = raw.match(/^[A-Za-z]*\s*(\d+)\s*[-.]\s*(\d+)$/);
  if (multiDisc) {
    return { disc: parseInt(multiDisc[1], 10), track: parseInt(multiDisc[2], 10) };
  }

  // Vinyl sides: A and B are the two sides of the first disc, C and D of the
  // second. Without this a 2xLP collapses onto disc 1 with four "track 1".
  const side = raw.match(/^([A-Za-z])(\d+)$/);
  if (side) {
    const sideIndex = side[1].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
    return { disc: Math.floor(sideIndex / 2) + 1, track: parseInt(side[2], 10) };
  }

  const plain = raw.match(/(\d+)/);
  return { disc: 1, track: plain ? parseInt(plain[1], 10) : fallbackIndex + 1 };
};

/**
 * "Nirvana (2)" -> "Nirvana". Discogs appends a numeric suffix whenever a name
 * is already taken; it belongs to their database, not to the sleeve.
 */
const cleanArtistName = (name: string): string => name.replace(/\s*\(\d+\)\s*$/, '').trim();

const formatRelease = (release: DiscogsRelease): FormattedDiscogsRelease => {
  const identifiers = release.identifiers || [];
  const barcodeEntry = identifiers.find(i => (i.type || '').toLowerCase() === 'barcode');
  // Barcodes are often printed with spaces on the sleeve.
  const barcode = barcodeEntry?.value ? barcodeEntry.value.replace(/[\s-]/g, '') : null;

  const images = release.images || [];
  const front = images.find(i => i.type === 'primary') || images[0];
  const back = images.find(i => i.type === 'secondary' && i.uri !== front?.uri);

  // Headings and index entries are not tracks.
  const playable = (release.tracklist || []).filter(t => !t.type_ || t.type_ === 'track');
  const byDisc = new Map<number, Array<{ trackNumber: number; title: string; durationSec: number | null }>>();

  playable.forEach((track, index) => {
    const { disc, track: trackNumber } = parsePosition(track.position, index);
    if (!byDisc.has(disc)) byDisc.set(disc, []);
    byDisc.get(disc)!.push({
      trackNumber,
      title: track.title || '',
      durationSec: durationToSeconds(track.duration)
    });
  });

  const discs = Array.from(byDisc.entries())
    .sort(([a], [b]) => a - b)
    .map(([number, tracks]) => {
      // Vinyl numbering restarts on every side and some releases have no usable
      // position at all, so a disc can end up with duplicate track numbers.
      // Keep the sleeve order and renumber sequentially when that happens.
      const collides = new Set(tracks.map(t => t.trackNumber)).size !== tracks.length;
      return {
        number,
        tracks: collides ? tracks.map((t, i) => ({ ...t, trackNumber: i + 1 })) : tracks
      };
    });

  const totalDuration = playable.reduce((sum, t) => sum + (durationToSeconds(t.duration) || 0), 0);

  return {
    discogsReleaseId: String(release.id),
    masterId: release.master_id || null,
    musicbrainzReleaseId: null,
    title: release.title || '',
    artist: (release.artists || []).map(a => cleanArtistName(a.name || '')).filter(Boolean),
    releaseYear: release.year || (release.released ? parseInt(release.released.slice(0, 4), 10) : null) || null,
    country: release.country || null,
    format: release.formats?.[0]?.name || 'CD',
    labels: (release.labels || []).map(l => l.name || '').filter(Boolean),
    catalogNumber: release.labels?.[0]?.catno || null,
    barcode,
    genres: Array.from(new Set([...(release.genres || []), ...(release.styles || [])])),
    editionNotes: release.notes || null,
    status: 'Official',
    coverArt: { front: front?.uri || null, back: back?.uri || null },
    discs,
    discCount: discs.length,
    totalDuration: totalDuration || null
  };
};

const search = async (criteria: { artist?: string | null; title?: string | null }): Promise<DiscogsSearchHit[]> => {
  const params: Record<string, unknown> = { type: 'release', per_page: 25 };
  if (criteria.artist) params.artist = criteria.artist;
  if (criteria.title) params.release_title = criteria.title;

  const data = await request<{ results?: DiscogsSearchHit[] }>('/database/search', params);
  return data.results || [];
};

/**
 * Free-text search, Discogs' own general query.
 *
 * More forgiving than artist+title when the sleeve credits a performer the
 * database files differently, or the model read the wording loosely.
 */
const searchFreeText = async (query: string): Promise<DiscogsSearchHit[]> => {
  const data = await request<{ results?: DiscogsSearchHit[] }>('/database/search', {
    q: query,
    type: 'release',
    per_page: 25
  });
  return data.results || [];
};

const searchByBarcode = async (barcode: string): Promise<DiscogsSearchHit[]> => {
  const data = await request<{ results?: DiscogsSearchHit[] }>('/database/search', {
    barcode,
    type: 'release',
    per_page: 25
  });
  return data.results || [];
};

/**
 * Artwork from the master release.
 *
 * Individual pressings are often catalogued with no image at all -- a Tracy
 * Chapman CD came in with images: [] -- while the master that groups them has
 * one. Returns null rather than throwing: this is best effort.
 */
const getMasterCoverArt = async (masterId: number | null | undefined): Promise<string | null> => {
  if (!masterId) return null;

  try {
    const master = await request<{ images?: Array<{ type?: string; uri?: string }> }>(
      `/masters/${masterId}`,
      {}
    );
    const images = master.images || [];
    const primary = images.find(i => i.type === 'primary') || images[0];
    return primary?.uri || null;
  } catch (error) {
    logger.warn(`Could not read master ${masterId} for cover art: ${(error as Error).message}`);
    return null;
  }
};

const getRelease = async (releaseId: string | number): Promise<DiscogsRelease> =>
  request<DiscogsRelease>(`/releases/${releaseId}`, {});

export default {
  isConfigured,
  search,
  searchFreeText,
  searchByBarcode,
  getRelease,
  getMasterCoverArt,
  formatRelease
};
