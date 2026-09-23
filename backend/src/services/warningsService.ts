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

type SkipReason = 'missing' | 'mismatch' | 'manual' | 'no_link';

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

const refreshMovie = async (movieId: number): Promise<RefreshOutcome> => {
  if (!ddd.isConfigured()) return 'skipped';
  const movie = await Movie.findById(movieId);
  if (!movie) return 'skipped';

  const now = new Date().toISOString();
  const link = await MovieWarning.getLink(movieId);
  let dddId = link?.ddd_id ?? null;
  let matchedBy = link?.matched_by ?? null;

  if (dddId === null) {
    const match = await ddd.findMatch(movie as unknown as Parameters<typeof ddd.findMatch>[0]);
    if (!match) {
      await MovieWarning.saveLink(movieId, null, null, now);
      return 'not_found';
    }
    dddId = match.dddId;
    matchedBy = match.matchedBy;
  }

  const votes = await ddd.getVotes(dddId);
  for (const topic of TOPIC_LIST) {
    await MovieWarning.saveVotes(movieId, topic, votes[topic].yes, votes[topic].no, now);
  }
  await MovieWarning.saveLink(movieId, dddId, matchedBy, now);
  return 'updated';
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

const importSnapshot = async (snapshot: Snapshot) => {
  const checkedAt = new Date(snapshot.fetched_at).toISOString();
  const skipped: Array<{ movie_id: number; reason: SkipReason }> = [];
  let imported = 0;

  for (const entry of snapshot.movies) {
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
