import Movie from '../models/movie';
import MovieWarning, { MatchedBy } from '../models/movieWarning';
import ddd, { DddQuotaError } from './doesTheDogDieService';
import { TOPICS, Topic, Override, WarningStatus, classify } from '../warnings/rules';
import logger from '../logger';

export interface TopicWarning {
  topic: Topic;
  status: WarningStatus;
  yes: number;
  no: number;
  override: Override | null;
  overrideAt: string | null;
  fetchedAt: string | null;
}

export interface MovieWarnings {
  movieId: number;
  dddId: number | null;
  dddUrl: string | null;
  matchedBy: MatchedBy | null;
  checkedAt: string | null;
  topics: TopicWarning[];
}

export type RefreshOutcome = 'updated' | 'not_found' | 'skipped';

type SnapshotVotes = { yes: number; no: number } | null;
export type SnapshotEntry = {
  movie_id: number;
  imdb_id: string | null;
  tmdb_id: number | null;
  ddd_id: number | null;
  matched_by: MatchedBy | null;
} & Partial<Record<Topic, SnapshotVotes>>;

export interface Snapshot {
  fetched_at: string;
  movies: SnapshotEntry[];
}

type SkipReason = 'invalid' | 'missing' | 'mismatch' | 'manual' | 'no_link';

const TOPIC_LIST = Object.keys(TOPICS) as Topic[];
const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getMovieWarnings = async (movieId: number): Promise<MovieWarnings> => {
  const [link, rows] = await Promise.all([MovieWarning.getLink(movieId), MovieWarning.getWarnings(movieId)]);
  return {
    movieId,
    dddId: link?.ddd_id ?? null,
    dddUrl: link?.ddd_id ? ddd.dddUrl(link.ddd_id) : null,
    matchedBy: link?.matched_by ?? null,
    checkedAt: link?.checked_at ?? null,
    topics: TOPIC_LIST.map(topic => {
      const row = rows.find(r => r.topic === topic);
      const yes = row?.yes_votes ?? 0;
      const no = row?.no_votes ?? 0;
      const override = row?.override ?? null;
      return {
        topic, yes, no, override,
        status: classify(yes, no, override),
        overrideAt: row?.override_at ?? null,
        fetchedAt: row?.fetched_at ?? null,
      };
    }),
  };
};

type MatchInput = Parameters<typeof ddd.findMatch>[0];

const fetchAndSave = async (movieId: number, movie: MatchInput): Promise<RefreshOutcome> => {
  const now = new Date().toISOString();
  const link = await MovieWarning.getLink(movieId);
  let dddId = link?.ddd_id ?? null;
  let matchedBy = link?.matched_by ?? null;

  if (dddId === null) {
    const match = await ddd.findMatch(movie);
    if (!match) {
      await MovieWarning.saveLink(movieId, null, null, now);
      return 'not_found';
    }
    dddId = match.dddId;
    matchedBy = match.matchedBy;
  }

  const votes = await ddd.getVotes(dddId);
  // A manual link saved while DoesTheDogDie answered wins: these votes belong to another entry.
  const current = await MovieWarning.getLink(movieId);
  if (current?.matched_by === 'manual' && current.ddd_id !== dddId) return 'skipped';
  for (const topic of TOPIC_LIST) {
    await MovieWarning.saveVotes(movieId, topic, votes[topic].yes, votes[topic].no, now);
  }
  await MovieWarning.saveLink(movieId, dddId, matchedBy, now);
  return 'updated';
};

// After a quota refusal, DoesTheDogDie is left alone for a day: without this, every
// movie still waiting in the create-time queue would send its own refused request.
const QUOTA_PAUSE_MS = DAY_MS;
let quotaBlocked: { until: number; status: number } | null = null;

/** Test helper: forget a quota refusal so the next refresh talks to DoesTheDogDie again. */
export const resetQuotaLatch = (): void => { quotaBlocked = null; };

const refreshMovie = async (movieId: number): Promise<RefreshOutcome> => {
  if (!ddd.isConfigured()) return 'skipped';
  if (quotaBlocked && Date.now() < quotaBlocked.until) throw new DddQuotaError(quotaBlocked.status);
  const movie = await Movie.findById(movieId);
  if (!movie) return 'skipped';
  try {
    return await fetchAndSave(movieId, movie as unknown as MatchInput);
  } catch (error) {
    if (error instanceof DddQuotaError) quotaBlocked = { until: Date.now() + QUOTA_PAUSE_MS, status: error.status };
    throw error;
  }
};

// One refresh at a time, so a CSV import of 200 movies does not fire 800 requests at once.
let queue: Promise<void> = Promise.resolve();

const scheduleRefresh = (movieId: number): void => {
  queue = queue
    .then(() => refreshMovie(movieId))
    .then(() => undefined)
    .catch(error => {
      logger.warn(`Spider/snake warnings not fetched for movie ${movieId}: ${(error as Error).message}`);
    });
};

const setOverride = async (movieId: number, topic: Topic, override: Override | null): Promise<MovieWarnings> => {
  await MovieWarning.setOverride(movieId, topic, override, new Date().toISOString());
  return getMovieWarnings(movieId);
};

const setManualLink = async (movieId: number, dddId: number): Promise<MovieWarnings> => {
  await MovieWarning.saveLink(movieId, dddId, 'manual', null);
  try {
    await refreshMovie(movieId);
  } catch (error) {
    logger.warn(`Votes not fetched after manual link for movie ${movieId}: ${(error as Error).message}`);
  }
  return getMovieWarnings(movieId);
};

const identifiersAgree = (entry: SnapshotEntry, movie: { imdb_id?: string | null; tmdb_id?: number | null }): boolean =>
  Boolean((entry.tmdb_id && entry.tmdb_id === movie.tmdb_id) || (entry.imdb_id && entry.imdb_id === movie.imdb_id));

const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;
const isCount = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0;
const SNAPSHOT_MATCHES: Array<MatchedBy | null> = ['imdb', 'tmdb', 'title_year', null];

const isValidEntry = (entry: SnapshotEntry): boolean => {
  if (typeof entry !== 'object' || entry === null) return false;
  if (!isPositiveInteger(entry.movie_id)) return false;
  if (!(entry.ddd_id === null || isPositiveInteger(entry.ddd_id))) return false;
  if (!SNAPSHOT_MATCHES.includes(entry.matched_by)) return false;
  return TOPIC_LIST.every(topic => {
    const votes = entry[topic];
    return votes === undefined || votes === null ||
      (typeof votes === 'object' && isCount(votes.yes) && isCount(votes.no));
  });
};

export const isValidSnapshotDate = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

const importSnapshot = async (snapshot: Snapshot) => {
  if (!isValidSnapshotDate(snapshot.fetched_at)) throw new RangeError(`Invalid fetched_at: ${snapshot.fetched_at}`);
  const checkedAt = new Date(snapshot.fetched_at).toISOString();
  const skipped: Array<{ movie_id: number | null; reason: SkipReason }> = [];
  let imported = 0;

  for (const entry of snapshot.movies) {
    if (!isValidEntry(entry)) {
      const movieId = (entry as { movie_id?: unknown } | null)?.movie_id;
      skipped.push({ movie_id: Number.isInteger(movieId) ? movieId as number : null, reason: 'invalid' });
      continue;
    }
    const movie = await Movie.findById(entry.movie_id);
    if (!movie) { skipped.push({ movie_id: entry.movie_id, reason: 'missing' }); continue; }
    if (!identifiersAgree(entry, movie as { imdb_id?: string | null; tmdb_id?: number | null })) {
      skipped.push({ movie_id: entry.movie_id, reason: 'mismatch' }); continue;
    }
    const link = await MovieWarning.getLink(entry.movie_id);
    if (link?.matched_by === 'manual') { skipped.push({ movie_id: entry.movie_id, reason: 'manual' }); continue; }
    if (!entry.ddd_id) { skipped.push({ movie_id: entry.movie_id, reason: 'no_link' }); continue; }

    for (const topic of TOPIC_LIST) {
      const votes = entry[topic];
      if (votes) await MovieWarning.saveVotes(entry.movie_id, topic, votes.yes, votes.no, checkedAt);
    }
    await MovieWarning.saveLink(entry.movie_id, entry.ddd_id, entry.matched_by, checkedAt);
    imported += 1;
  }
  return { imported, skipped };
};

const runDailyRefresh = async (
  { maxRequests = 300, delayMs = 1000, staleDays = 30, now = new Date() }:
  { maxRequests?: number; delayMs?: number; staleDays?: number; now?: Date } = {}
): Promise<{ refreshed: number; stoppedByQuota: boolean }> => {
  if (!ddd.isConfigured()) return { refreshed: 0, stoppedByQuota: false };

  // maxRequests is a budget per run, not per calendar day: besides the daily tick,
  // every backend start triggers a run after 60 s, so a restart spends a fresh budget.
  const cutoff = new Date(now.getTime() - staleDays * DAY_MS).toISOString();
  const ids = await MovieWarning.listDueForRefresh(cutoff, maxRequests);
  const start = ddd.getRequestCount();
  let refreshed = 0;

  for (const id of ids) {
    if (ddd.getRequestCount() - start >= maxRequests) break;
    try {
      await refreshMovie(id);
      refreshed += 1;
    } catch (error) {
      if (error instanceof DddQuotaError) {
        logger.warn(`Spider/snake refresh stopped: ${error.message}`);
        return { refreshed, stoppedByQuota: true };
      }
      logger.warn(`Spider/snake refresh failed for movie ${id}: ${(error as Error).message}`);
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  return { refreshed, stoppedByQuota: false };
};

const startDailyRefresh = (): void => {
  if (process.env.NODE_ENV === 'test') return;
  const tick = () => {
    runDailyRefresh()
      .then(r => logger.info(`Spider/snake refresh: ${r.refreshed} movies${r.stoppedByQuota ? ' (stopped by quota)' : ''}`))
      .catch(error => logger.warn(`Spider/snake refresh crashed: ${(error as Error).message}`));
  };
  // Let the server settle before the first run, then once a day.
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, DAY_MS).unref();
};

export default {
  refreshMovie, scheduleRefresh, getMovieWarnings, setOverride, setManualLink,
  importSnapshot, runDailyRefresh, startDailyRefresh,
};
