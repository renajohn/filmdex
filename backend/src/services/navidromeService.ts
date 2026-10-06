import axios from 'axios';
import crypto from 'crypto';

/**
 * Navidrome, read through its Subsonic API (OpenSubsonic adds the release
 * MBID on albums and the bit depth on songs). DexVault reaches it over the
 * shared docker network: through Traefik, its mkcert certificate is not one
 * Node can verify.
 */
const DEFAULT_URL = 'http://navidrome:4533';
/** Where a browser reaches Navidrome, through Traefik: the links DexVault hands out. */
const DEFAULT_PUBLIC_URL = 'https://music.lab.crog.org';
const PAGE_SIZE = 500;
const TIMEOUT_MS = 20000;

export interface NavidromeAlbum {
  id: string;
  name: string;
  artist: string;
  musicBrainzId: string | null;
  songCount: number;
}

export interface NavidromeSong {
  albumId: string;
  suffix: string;
  bitDepth: number | null;
}

type SubsonicResponse<T> = { 'subsonic-response': T & { status: 'ok' | 'failed'; error?: { code: number; message: string } } };

const config = () => ({
  url: (process.env.NAVIDROME_URL || DEFAULT_URL).replace(/\/+$/, ''),
  user: process.env.NAVIDROME_USER || '',
  password: process.env.NAVIDROME_PASSWORD || '',
});

const isConfigured = (): boolean => {
  const { user, password } = config();
  return Boolean(user && password);
};

/** Token authentication: the password itself never travels, only md5(password + salt). */
const authParams = (): Record<string, string> => {
  const { user, password } = config();
  if (!user || !password) throw new Error('Navidrome is not configured: set NAVIDROME_USER and NAVIDROME_PASSWORD');
  const salt = crypto.randomBytes(8).toString('hex');
  const token = crypto.createHash('md5').update(password + salt).digest('hex');
  return { u: user, t: token, s: salt, v: '1.16.1', c: 'dexvault', f: 'json' };
};

const request = async <T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> => {
  const { url } = config();
  const auth = authParams();

  let data: SubsonicResponse<T>;
  try {
    const response = await axios.get<SubsonicResponse<T>>(`${url}/rest/${endpoint}`, {
      params: { ...params, ...auth },
      timeout: TIMEOUT_MS,
    });
    data = response.data;
  } catch (error) {
    // Never surface the raw axios error: its config carries the token.
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    throw new Error(`Navidrome request failed${status ? ` (HTTP ${status})` : ''}`);
  }

  const body = data['subsonic-response'];
  if (body.status !== 'ok') throw new Error(`Navidrome refused ${endpoint}: ${body.error?.message || 'unknown error'}`);
  return body;
};

/** One file of a rip, as the track panel shows it. */
export interface NavidromeTrackFile {
  discNumber: number;
  track: number;
  title: string;
  durationSec: number | null;
  suffix: string;
  bitRate: number | null;
  bitDepth: number | null;
  samplingRate: number | null;
  channelCount: number | null;
  size: number | null;
  path: string | null;
}

type RawAlbum = { id: string; name: string; artist?: string; musicBrainzId?: string; songCount?: number };
type RawAlbumSong = {
  title?: string; track?: number; discNumber?: number; duration?: number; suffix?: string; bitRate?: number;
  bitDepth?: number; samplingRate?: number; channelCount?: number; size?: number; path?: string;
};
type RawSong = { albumId?: string; suffix?: string; bitDepth?: number };

const toAlbum = (raw: RawAlbum): NavidromeAlbum => ({
  id: raw.id,
  name: raw.name,
  artist: raw.artist || '',
  musicBrainzId: raw.musicBrainzId || null,
  songCount: raw.songCount || 0,
});

const navidromeService = {
  isConfigured,

  /** The album's page in Navidrome's web player. */
  albumUrl: (albumId: string): string =>
    `${(process.env.NAVIDROME_PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/+$/, '')}/app/#/album/${encodeURIComponent(albumId)}/show`,

  /** Every album, page by page. */
  getAlbums: async (): Promise<NavidromeAlbum[]> => {
    const albums: NavidromeAlbum[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const body = await request<{ albumList2?: { album?: RawAlbum[] } }>('getAlbumList2', { type: 'alphabeticalByName', size: PAGE_SIZE, offset });
      const page = body.albumList2?.album || [];
      albums.push(...page.map(toAlbum));
      if (page.length < PAGE_SIZE) return albums;
    }
  },

  /**
   * An album's cover as Navidrome shows it: cover.jpg or front.jpg beside the
   * files, else the image embedded in them. Navidrome does not serve the back.
   */
  getCoverArt: async (albumId: string): Promise<{ data: Buffer; contentType: string }> => {
    const { url } = config();
    let response;
    try {
      response = await axios.get<ArrayBuffer>(`${url}/rest/getCoverArt`, {
        params: { id: albumId, ...authParams() },
        responseType: 'arraybuffer',
        timeout: TIMEOUT_MS,
      });
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      throw new Error(`Navidrome cover request failed${status ? ` (HTTP ${status})` : ''}`);
    }
    const contentType = String(response.headers['content-type'] || '');
    // A refusal comes back as a Subsonic error document, not as an image.
    if (!contentType.startsWith('image/')) throw new Error('Navidrome has no cover for this album');
    return { data: Buffer.from(response.data), contentType };
  },

  /** The files of one album, with what a rip is judged by: format, bit depth, sampling rate. */
  getAlbumSongs: async (albumId: string): Promise<NavidromeTrackFile[]> => {
    const body = await request<{ album?: { song?: RawAlbumSong[] } }>('getAlbum', { id: albumId });
    return (body.album?.song || []).map(song => ({
      discNumber: song.discNumber || 1,
      track: song.track || 0,
      title: song.title || '',
      durationSec: song.duration ?? null,
      suffix: (song.suffix || '').toLowerCase(),
      bitRate: song.bitRate || null,
      bitDepth: song.bitDepth || null,
      samplingRate: song.samplingRate || null,
      channelCount: song.channelCount || null,
      size: song.size || null,
      path: song.path || null,
    }));
  },

  /** Every song with its format: an empty search3 query lists the whole library in Navidrome. */
  getSongs: async (): Promise<NavidromeSong[]> => {
    const songs: NavidromeSong[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const body = await request<{ searchResult3?: { song?: RawSong[] } }>('search3', {
        query: '', songCount: PAGE_SIZE, songOffset: offset, albumCount: 0, artistCount: 0,
      });
      const page = body.searchResult3?.song || [];
      songs.push(...page.filter(song => song.albumId).map(song => ({
        albumId: song.albumId!, suffix: (song.suffix || '').toLowerCase(), bitDepth: song.bitDepth || null,
      })));
      if (page.length < PAGE_SIZE) return songs;
    }
  },
};

export default navidromeService;
