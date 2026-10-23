import Movie from '../models/movie';
import MovieFilmages, { FilmagesMatchedBy } from '../models/movieFilmages';
import filmages, { FilmagesElement, MatchInput } from './filmagesService';
import ageRecommendationService from './ageRecommendationService';
import logger from '../logger';

/**
 * A movie's FilmAges ages. The age DexVault shows, sorts and filters by
 * (`movies.recommended_age`) is FilmAges' suggested age, or its legal age when it
 * suggests none; a movie FilmAges does not know keeps the TMDB/OMDB median.
 */
export interface MovieFilmages {
  movieId: number;
  filmagesId: number | null;
  filmagesUrl: string | null;
  ageLegal: number | null;
  ageSuggested: number | null;
  indications: FilmagesElement[];
  counterIndications: FilmagesElement[];
  synthesis: string | null;
  matchedBy: FilmagesMatchedBy | null;
  checkedAt: string | null;
  /** The age the movie now shows, and where it comes from ('filmages', or null for TMDB/OMDB). */
  movieAge: number | null;
  ageSource: string | null;
}

export type RefreshOutcome = 'updated' | 'not_found' | 'skipped';

const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const effectiveAge = (ageLegal: number | null, ageSuggested: number | null): number | null =>
  ageSuggested ?? ageLegal;

const getMovieFilmages = async (movieId: number): Promise<MovieFilmages> => {
  const [record, movie] = await Promise.all([
    MovieFilmages.get(movieId),
    Movie.findById(movieId) as Promise<{ recommended_age?: number | null; age_source?: string | null } | null>,
  ]);
  const id = record?.filmages_id ?? null;
  return {
    movieId,
    filmagesId: id,
    filmagesUrl: id ? filmages.filmagesUrl(id) : null,
    ageLegal: record?.age_legal ?? null,
    ageSuggested: record?.age_suggested ?? null,
    indications: record?.indications ?? [],
    counterIndications: record?.counter_indications ?? [],
    synthesis: record?.synthesis ?? null,
    matchedBy: record?.matched_by ?? null,
    checkedAt: record?.checked_at ?? null,
    movieAge: movie?.recommended_age ?? null,
    ageSource: movie?.age_source ?? null,
  };
};

/** FilmAges' age becomes the movie's; without one, the TMDB/OMDB median comes back. */
const applyAge = async (movieId: number): Promise<void> => {
  const record = await MovieFilmages.get(movieId);
  const age = record ? effectiveAge(record.age_legal, record.age_suggested) : null;
  if (age !== null) {
    await Movie.updateFields(movieId, { recommended_age: age, age_processed: true, age_source: 'filmages' });
    return;
  }
  const movie = await Movie.findById(movieId) as { tmdb_id?: number | null; imdb_id?: string | null } | undefined;
  if (!movie) return;
  const median = movie.tmdb_id || movie.imdb_id
    ? await ageRecommendationService.getRecommendedAge(movie.tmdb_id ?? null, movie.imdb_id ?? null)
    : null;
  await Movie.updateFields(movieId, median !== null
    ? { recommended_age: median, age_processed: true, age_source: null }
    : { age_source: null });
};

const refreshMovie = async (movieId: number): Promise<RefreshOutcome> => {
  if (!filmages.isEnabled()) return 'skipped';
  const movie = await Movie.findById(movieId) as (MatchInput & { media_type?: string | null }) | undefined;
  if (!movie || movie.media_type === 'tv') return 'skipped';
  const link = await MovieFilmages.get(movieId);
  const now = new Date().toISOString();

  if (link?.matched_by === 'manual') {
    if (!link.filmages_id) return 'skipped';
    await MovieFilmages.save(movieId, await filmages.getFilm(link.filmages_id), 'manual', now);
    await applyAge(movieId);
    return 'updated';
  }

  const film = link?.filmages_id ? await filmages.getFilm(link.filmages_id) : await filmages.findMatch(movie);
  // A manual link saved while FilmAges answered wins.
  if ((await MovieFilmages.get(movieId))?.matched_by === 'manual') return 'skipped';
  await MovieFilmages.save(movieId, film, film ? 'auto' : null, now);
  if (!film) return 'not_found';
  await applyAge(movieId);
  return 'updated';
};

// One movie at a time: FilmAges is a small site, and a CSV import adds 200 at once.
let queue: Promise<void> = Promise.resolve();

const scheduleRefresh = (movieId: number): void => {
  queue = queue
    .then(() => refreshMovie(movieId))
    .then(() => undefined)
    .catch(error => {
      logger.warn(`FilmAges not fetched for movie ${movieId}: ${(error as Error).message}`);
    });
};

/** A FilmAges film id or page address chosen by hand; null says FilmAges does not have it. */
const setManualLink = async (movieId: number, filmagesId: number | null): Promise<MovieFilmages> => {
  const now = new Date().toISOString();
  const film = filmagesId ? await filmages.getFilm(filmagesId) : null;
  await MovieFilmages.save(movieId, film, 'manual', now);
  await applyAge(movieId);
  return getMovieFilmages(movieId);
};

/** Forget a manual choice and search again. */
const clearManualLink = async (movieId: number): Promise<MovieFilmages> => {
  await MovieFilmages.remove(movieId);
  await refreshMovie(movieId);
  await applyAge(movieId);
  return getMovieFilmages(movieId);
};

const runSweep = async (
  { maxMovies = 500, delayMs = 300, retryDays = 30, now = new Date() }:
  { maxMovies?: number; delayMs?: number; retryDays?: number; now?: Date } = {}
): Promise<{ found: number; notFound: number }> => {
  const cutoff = new Date(now.getTime() - retryDays * DAY_MS).toISOString();
  const ids = await MovieFilmages.listDue(cutoff, maxMovies);
  let found = 0;
  let notFound = 0;
  for (const id of ids) {
    try {
      const outcome = await refreshMovie(id);
      if (outcome === 'updated') found += 1;
      if (outcome === 'not_found') notFound += 1;
    } catch (error) {
      logger.warn(`FilmAges sweep failed for movie ${id}: ${(error as Error).message}`);
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  return { found, notFound };
};

const startDailySweep = (): void => {
  if (process.env.NODE_ENV === 'test') return;
  const tick = () => {
    runSweep()
      .then(r => logger.info(`FilmAges sweep: ${r.found} found, ${r.notFound} not found`))
      .catch(error => logger.warn(`FilmAges sweep crashed: ${(error as Error).message}`));
  };
  setTimeout(tick, 90 * 1000).unref();
  setInterval(tick, DAY_MS).unref();
};

export default {
  getMovieFilmages, refreshMovie, scheduleRefresh, setManualLink, clearManualLink,
  runSweep, startDailySweep, applyAge,
};
