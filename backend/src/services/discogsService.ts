import axios, { AxiosResponse } from 'axios';
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
      params: { ...params, token },
      headers: { 'User-Agent': USER_AGENT },
      timeout: TIMEOUT_MS
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      throw new Error('Discogs rate limit reached. Please try again in a moment.');
    }
    throw error;
  }
};

/** "4:19" -> 259. Discogs also uses "1:02:30" for long pieces. */
const durationToSeconds = (value: string | undefined): number | null => {
  if (!value) return null;
  const parts = value.split(':').map(p => parseInt(p, 10));
  if (parts.some(Number.isNaN) || parts.length === 0) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

/**
 * Discogs positions are "1", "A1" for vinyl sides, or "2-5" on multi-disc sets.
 * Returns the disc and the track number within it.
 */
const parsePosition = (position: string | undefined, fallbackIndex: number): { disc: number; track: number } => {
  const raw = (position || '').trim();
  const multiDisc = raw.match(/^(\d+)[-.](\d+)$/);
  if (multiDisc) {
    return { disc: parseInt(multiDisc[1], 10), track: parseInt(multiDisc[2], 10) };
  }

  const plain = raw.match(/(\d+)/);
  return { disc: 1, track: plain ? parseInt(plain[1], 10) : fallbackIndex + 1 };
};

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
    .map(([number, tracks]) => ({ number, tracks }));

  const totalDuration = playable.reduce((sum, t) => sum + (durationToSeconds(t.duration) || 0), 0);

  return {
    discogsReleaseId: String(release.id),
    musicbrainzReleaseId: null,
    title: release.title || '',
    artist: (release.artists || []).map(a => a.name || '').filter(Boolean),
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

const searchByBarcode = async (barcode: string): Promise<DiscogsSearchHit[]> => {
  const data = await request<{ results?: DiscogsSearchHit[] }>('/database/search', {
    barcode,
    type: 'release',
    per_page: 25
  });
  return data.results || [];
};

const getRelease = async (releaseId: string | number): Promise<DiscogsRelease> =>
  request<DiscogsRelease>(`/releases/${releaseId}`, {});

export default {
  isConfigured,
  search,
  searchByBarcode,
  getRelease,
  formatRelease
};
