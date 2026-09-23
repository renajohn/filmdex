import axios, { AxiosError } from 'axios';
import configManager from '../config';
import tmdbService from './tmdbService';
import { TOPICS, Topic } from '../warnings/rules';
import { cleanTitle, normalizeTitle } from '../warnings/titles';
import type { MatchedBy } from '../models/movieWarning';

const BASE_URL = 'https://www.doesthedogdie.com';
/** Cloudflare answers 403 to anonymous clients such as Python-urllib. */
const USER_AGENT = 'DexVault/1.0 +https://github.com/renajohn/filmdex';
const TIMEOUT_MS = 10000;

/** 403 or 429: the key is refused or the quota is spent. Stops any batch. */
export class DddQuotaError extends Error {
  constructor(public status: number) {
    super(`DoesTheDogDie refused the request (HTTP ${status})`);
    this.name = 'DddQuotaError';
  }
}

export interface DddItem {
  id: number;
  name: string;
  releaseYear: string | null;
  imdbId: string | null;
  tmdbid: number | null;
}

export type Votes = Record<Topic, { yes: number; no: number }>;

export interface MatchInput {
  title: string;
  original_title?: string | null;
  imdb_id?: string | null;
  tmdb_id?: number | null;
  release_date?: string | null;
  media_type?: string | null;
}

export interface Match {
  dddId: number;
  matchedBy: Exclude<MatchedBy, 'manual'>;
}

let requestCount = 0;
export const getRequestCount = (): number => requestCount;

const getApiKey = (): string | null => {
  // Read the environment first: getApiKeys() throws until the data config is loaded.
  if (process.env.DOES_DOG_DIE) return process.env.DOES_DOG_DIE;
  try {
    return configManager.getApiKeys().doesthedogdie || null;
  } catch (_) {
    return null;
  }
};

export const isConfigured = (): boolean => Boolean(getApiKey());

export const dddUrl = (dddId: number): string => `${BASE_URL}/media/${dddId}`;

const request = async <T>(path: string, params?: Record<string, unknown>): Promise<T> => {
  const key = getApiKey();
  if (!key) throw new Error('DoesTheDogDie is not configured: set DOES_DOG_DIE to enable it');

  requestCount += 1;
  try {
    const response = await axios.get<T>(`${BASE_URL}${path}`, {
      params,
      timeout: TIMEOUT_MS,
      headers: { Accept: 'application/json', 'X-API-KEY': key, 'User-Agent': USER_AGENT },
    });
    return response.data;
  } catch (error) {
    const status = (error as AxiosError).response?.status;
    if (status === 403 || status === 429) throw new DddQuotaError(status);
    throw error;
  }
};

export const search = async (query: string): Promise<DddItem[]> => {
  const data = await request<{ items?: DddItem[] }>('/dddsearch', { q: query });
  return data.items ?? [];
};

export const getVotes = async (dddId: number): Promise<Votes> => {
  const data = await request<{ topicItemStats?: Array<{ TopicId: number; yesSum: number; noSum: number }> }>(
    `/media/${dddId}`
  );
  const votes = {} as Votes;
  for (const [topic, topicId] of Object.entries(TOPICS) as Array<[Topic, number]>) {
    const stat = data.topicItemStats?.find(s => s.TopicId === topicId);
    votes[topic] = { yes: stat?.yesSum ?? 0, no: stat?.noSum ?? 0 };
  }
  return votes;
};

const yearOf = (value: string | null | undefined): number | null => {
  const year = value ? parseInt(value.slice(0, 4), 10) : NaN;
  return Number.isNaN(year) ? null : year;
};

/** Identifiers first; a title and year only when DDD has no usable identifier. */
export const pickMatch = (items: DddItem[], movie: MatchInput, queryTitle?: string): Match | null => {
  if (movie.imdb_id) {
    const hit = items.find(i => i.imdbId === movie.imdb_id);
    if (hit) return { dddId: hit.id, matchedBy: 'imdb' };
  }
  if (movie.tmdb_id) {
    const hit = items.find(i => i.tmdbid === movie.tmdb_id);
    if (hit) return { dddId: hit.id, matchedBy: 'tmdb' };
  }

  const titles = new Set(
    [movie.title, movie.original_title, queryTitle].filter((t): t is string => Boolean(t)).map(normalizeTitle)
  );
  const year = yearOf(movie.release_date);
  const hit = items.find(i => {
    if (!titles.has(normalizeTitle(i.name))) return false;
    const itemYear = yearOf(i.releaseYear);
    return year === null || itemYear === null || Math.abs(itemYear - year) <= 1;
  });
  return hit ? { dddId: hit.id, matchedBy: 'title_year' } : null;
};

const englishTitle = async (movie: MatchInput): Promise<string | null> => {
  if (!movie.tmdb_id) return null;
  const details = movie.media_type === 'tv'
    ? await tmdbService.getTVShowDetails(movie.tmdb_id)
    : await tmdbService.getMovieDetails(movie.tmdb_id);
  return (details as { title?: string } | null)?.title ?? null;
};

/** DexVault title, then original title, then TMDB's English title. */
export const findMatch = async (movie: MatchInput): Promise<Match | null> => {
  const tried = new Set<string>();
  const attempts: Array<() => Promise<string | null> | string | null> = [
    () => cleanTitle(movie.title),
    () => (movie.original_title ? cleanTitle(movie.original_title) : null),
    () => englishTitle(movie),
  ];

  for (const next of attempts) {
    const query = await next();
    if (!query || tried.has(query)) continue;
    tried.add(query);
    const match = pickMatch(await search(query), movie, query);
    if (match) return match;
  }
  return null;
};

export default { isConfigured, search, getVotes, pickMatch, findMatch, getRequestCount, dddUrl };
