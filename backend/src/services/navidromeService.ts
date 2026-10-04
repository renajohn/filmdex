import axios from 'axios';
import crypto from 'crypto';

/**
 * Navidrome, read through its Subsonic API (OpenSubsonic adds the release
 * MBID on albums and the bit depth on songs). DexVault reaches it over the
 * shared docker network: through Traefik, its mkcert certificate is not one
 * Node can verify.
 */
const DEFAULT_URL = 'http://navidrome:4533';
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
const request = async <T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> => {
  const { url, user, password } = config();
  if (!user || !password) throw new Error('Navidrome is not configured: set NAVIDROME_USER and NAVIDROME_PASSWORD');
  const salt = crypto.randomBytes(8).toString('hex');
  const token = crypto.createHash('md5').update(password + salt).digest('hex');

  let data: SubsonicResponse<T>;
  try {
    const response = await axios.get<SubsonicResponse<T>>(`${url}/rest/${endpoint}`, {
      params: { ...params, u: user, t: token, s: salt, v: '1.16.1', c: 'dexvault', f: 'json' },
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

type RawAlbum = { id: string; name: string; artist?: string; musicBrainzId?: string; songCount?: number };
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
