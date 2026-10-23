import { getDatabase } from '../database';
import Movie from '../models/movie';
import MovieCollection from '../models/movieCollection';
import tmdbService, { type TMDBCreditedMovie } from './tmdbService';
import omdbService from './omdbService';
import imageService from './imageService';
import movieCreditsService, { type TMDBCredits } from './movieCreditsService';
import ageRecommendationService from './ageRecommendationService';
import collectionService from './collectionService';
import warningsService from './warningsService';
import movieFilmagesService from './movieFilmagesService';
import { namesSomeone, namesSomething } from '../utils/searchNames';
import type { MovieData } from '../types';
import logger from '../logger';

/**
 * Finding a movie as one finds an album: as one types, a title, a director,
 * an actor or a saga. A person or a saga the words name gets a pill, which
 * opens their movies. A movie is added at once, with its poster: its ratings,
 * age, backdrop and cast follow in the background. A saga's movies can be
 * wished or added together, as one box set.
 */

export const FORMATS = ['Blu-ray 4K', 'Blu-ray', 'DVD', 'Digital'] as const;

export class MovieFinderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'MovieFinderError';
  }
}

export interface Have {
  /** The editions of the collection: their format and title (a Steelbook, a Director's Cut). */
  owned: Array<{ id: number; format: string | null; title: string }>;
  wished: { id: number; format: string | null } | null;
}

export interface FinderMovie {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string | null;
  year: string | null;
  posterPath: string | null;
  directors: string[];
  have: Have;
}

export interface FinderPerson {
  id: number;
  name: string;
  role: 'director' | 'actor';
  profilePath: string | null;
  posters: string[];
}

export interface FinderSaga {
  id: number;
  name: string;
  posterPath: string | null;
  movies: number;
}

const yearOf = (date: string | null | undefined): string | null => (date ? date.slice(0, 4) : null) || null;

/* ---------- What DexVault already has ---------- */

const haveOf = (tmdbIds: number[]): Promise<Map<number, Have>> => new Promise((resolve, reject) => {
  const index = new Map<number, Have>();
  const ids = [...new Set(tmdbIds.filter(Boolean))];
  if (!ids.length) { resolve(index); return; }
  getDatabase().all(
    `SELECT id, tmdb_id, title, format, title_status FROM movies
     WHERE title_status IN ('owned', 'wish') AND tmdb_id IN (${ids.map(() => '?').join(',')})`,
    ids,
    (err: Error | null, rows: Array<{ id: number; tmdb_id: number; title: string; format: string | null; title_status: string }>) => {
      if (err) { reject(err); return; }
      for (const row of rows) {
        const have = index.get(row.tmdb_id) ?? { owned: [], wished: null };
        if (row.title_status === 'owned') have.owned.push({ id: row.id, format: row.format, title: row.title });
        else have.wished = { id: row.id, format: row.format };
        index.set(row.tmdb_id, have);
      }
      resolve(index);
    });
});

const nothing = (): Have => ({ owned: [], wished: null });

const fromCredit = (movie: TMDBCreditedMovie | { id: number; title: string; original_title?: string; release_date?: string; poster_path?: string | null }) => ({
  id: movie.id,
  mediaType: 'movie' as const,
  title: movie.title,
  originalTitle: movie.original_title && movie.original_title !== movie.title ? movie.original_title : null,
  year: yearOf(movie.release_date),
  posterPath: movie.poster_path ?? null,
  directors: [] as string[],
});

const withHave = async <T extends { id: number; mediaType: string }>(movies: T[]): Promise<Array<T & { have: Have }>> => {
  const index = await haveOf(movies.filter(movie => movie.mediaType === 'movie' || movie.mediaType === 'tv').map(movie => movie.id));
  return movies.map(movie => ({ ...movie, have: index.get(movie.id) ?? nothing() }));
};

const byYear = <T extends { year: string | null }>(a: T, b: T) => (a.year || '9999').localeCompare(b.year || '9999');

/* ---------- Adding ---------- */

interface AddInput {
  tmdbId: number;
  mediaType?: string;
  titleStatus: 'owned' | 'wish';
  format?: string | null;
  /** What tells this edition apart: Steelbook, Director's Cut. Joins the title as the collection names its editions. */
  edition?: string | null;
  price?: number | string | null;
  acquiredDate?: string | null;
  comments?: string | null;
}

const editionTitle = (title: string, edition?: string | null) => (edition && edition.trim() ? `${title}, ${edition.trim()}` : title);

const checkFormat = (format: string | null | undefined): string => {
  if (!format) return 'Blu-ray';
  if (!(FORMATS as readonly string[]).includes(format)) throw new MovieFinderError(`Unknown format: ${format}`, 400);
  return format;
};

const priceOf = (price: number | string | null | undefined): number | null => {
  const value = typeof price === 'string' ? parseFloat(price.replace(',', '.')) : price;
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
};

/** What takes time, once the movie is saved: its backdrop, ratings, age, cast and crew. */
const enrichLater = (movieId: number, details: NonNullable<Awaited<ReturnType<typeof tmdbService.getMovieDetails>>>, mediaType: string): void => {
  void (async () => {
    const fields: Record<string, unknown> = {};
    try {
      fields.backdrop_path = await imageService.downloadBackdrop(details.backdrop_path ?? null, details.id);
    } catch (error) { logger.warn(`Backdrop of movie ${movieId}: ${(error as Error).message}`); }
    if (details.imdb_id) {
      try {
        const omdb = await omdbService.getMovieByImdbId(details.imdb_id);
        if (omdb?.imdbRating) fields.imdb_rating = omdb.imdbRating;
        if (omdb?.rottenTomatoRating) fields.rotten_tomato_rating = omdb.rottenTomatoRating;
      } catch (error) { logger.warn(`Ratings of movie ${movieId}: ${(error as Error).message}`); }
    }
    try {
      const age = mediaType === 'tv'
        ? await ageRecommendationService.getRecommendedAgeForTV(details.id, details.imdb_id)
        : await ageRecommendationService.getRecommendedAge(details.id, details.imdb_id);
      if (age !== null) { fields.recommended_age = age; fields.age_processed = true; }
    } catch (error) { logger.warn(`Age of movie ${movieId}: ${(error as Error).message}`); }
    try {
      if (Object.keys(fields).length) await Movie.updateFields(movieId, fields);
      await movieCreditsService.processCastAndCrew(movieId, details.credits as unknown as TMDBCredits, details.id);
    } catch (error) { logger.warn(`Cast and crew of movie ${movieId}: ${(error as Error).message}`); }
    warningsService.scheduleRefresh(movieId);
    movieFilmagesService.scheduleRefresh(movieId);
  })();
};

const isDuplicate = (error: unknown) => /UNIQUE constraint failed/.test((error as Error)?.message || '');

const movieFinderService = {
  /**
   * The movies a search finds (and series), each with its directors and what
   * one has of it; the people it names (a surname is enough) and the sagas.
   */
  search: async (query: string): Promise<{ movies: FinderMovie[]; people: FinderPerson[]; sagas: FinderSaga[] }> => {
    const q = query.trim();
    if (q.length < 2) return { movies: [], people: [], sagas: [] };

    const [found, peopleFound, sagasFound] = await Promise.all([
      tmdbService.searchAll(q),
      tmdbService.searchPeople(q).catch(() => []),
      tmdbService.searchCollections(q).catch(() => []),
    ]);

    const top = found.slice(0, 20);
    const directors = await Promise.all(top.map((movie, i) => i < 10
      ? tmdbService.getMovieDirectors(movie.id, movie.media_type).catch(() => [])
      : Promise.resolve([] as string[])));
    const movies = await withHave(top.map((movie, i) => ({
      id: movie.id,
      mediaType: (movie.media_type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv',
      title: movie.title,
      originalTitle: movie.original_title && movie.original_title !== movie.title ? movie.original_title : null,
      year: yearOf(movie.release_date),
      posterPath: movie.poster_path ?? null,
      directors: directors[i],
    })));

    const people = peopleFound
      .filter(person => (person.known_for_department === 'Directing' || person.known_for_department === 'Acting') && namesSomeone(q, person.name))
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 4)
      .map(person => ({
        id: person.id,
        name: person.name,
        role: (person.known_for_department === 'Directing' ? 'director' : 'actor') as 'director' | 'actor',
        profilePath: person.profile_path ?? null,
        posters: (person.known_for || []).filter(work => work.poster_path).slice(0, 3).map(work => work.poster_path as string),
      }));

    const named = sagasFound.filter(saga => namesSomething(q, saga.name)).slice(0, 2);
    const sagas = await Promise.all(named.map(async saga => {
      const details = await tmdbService.getCollection(saga.id).catch(() => null);
      return { id: saga.id, name: saga.name, posterPath: saga.poster_path ?? null, movies: details?.parts.length ?? 0 };
    }));

    return { movies, people, sagas: sagas.filter(saga => saga.movies > 1) };
  },

  /** A person's movies, directed and played in, the oldest first. */
  person: async (personId: number): Promise<{ person: { id: number; name: string; profilePath: string | null; role: 'director' | 'actor' }; directed: FinderMovie[]; actedIn: FinderMovie[] }> => {
    if (!Number.isInteger(personId) || personId <= 0) throw new MovieFinderError('Unknown person', 400);
    const [person, credits] = await Promise.all([tmdbService.getPerson(personId), tmdbService.getPersonMovieCredits(personId)]);
    const unique = (list: TMDBCreditedMovie[]) => [...new Map(list.map(movie => [movie.id, movie])).values()];
    const directed = unique(credits.crew.filter(movie => movie.job === 'Director')).map(fromCredit);
    const actedIn = unique(credits.cast).map(fromCredit);
    const [d, a] = await Promise.all([withHave(directed), withHave(actedIn)]);
    return {
      person: { id: person.id, name: person.name, profilePath: person.profile_path ?? null, role: person.known_for_department === 'Directing' ? 'director' : 'actor' },
      directed: d.sort(byYear),
      actedIn: a.sort(byYear),
    };
  },

  /** A saga and its movies, in their order. */
  saga: async (collectionId: number): Promise<{ saga: { id: number; name: string; posterPath: string | null }; movies: FinderMovie[] }> => {
    if (!Number.isInteger(collectionId) || collectionId <= 0) throw new MovieFinderError('Unknown saga', 400);
    const saga = await tmdbService.getCollection(collectionId);
    const movies = await withHave(saga.parts.map(fromCredit));
    return { saga: { id: saga.id, name: saga.name, posterPath: saga.poster_path ?? null }, movies: movies.sort(byYear) };
  },

  /**
   * A movie wished or of the collection, saved at once: what takes time (its
   * ratings, age, backdrop, cast) follows in the background. A wished movie
   * added to the collection in the same format and title becomes it.
   */
  addMovie: async (input: AddInput): Promise<MovieData & { id: number }> => {
    const tmdbId = Number(input.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new MovieFinderError('A TMDB id is needed', 400);
    const mediaType = input.mediaType === 'tv' ? 'tv' : 'movie';
    const titleStatus = input.titleStatus === 'owned' ? 'owned' : 'wish';
    const format = checkFormat(input.format);

    const details = mediaType === 'tv' ? await tmdbService.getTVShowDetails(tmdbId) : await tmdbService.getMovieDetails(tmdbId);
    if (!details) throw new MovieFinderError('TMDB does not know this movie', 404);
    const title = editionTitle(details.title || '', input.edition);

    const editions = await Movie.findAllByTmdbId(tmdbId);
    const same = editions.find(edition => edition.title === title && edition.format === format);
    if (same && (same.title_status === titleStatus || same.title_status === 'owned')) {
      throw new MovieFinderError(same.title_status === 'owned'
        ? `You already have this ${format}: name what tells this one apart (a Steelbook…)`
        : 'This movie is already on the wish list', 409);
    }
    if (same && titleStatus === 'owned') {
      await Movie.updateFields(same.id, {
        title_status: 'owned', price: priceOf(input.price), acquired_date: input.acquiredDate || new Date().toISOString().slice(0, 10),
        comments: input.comments || same.comments || '',
      });
      return (await Movie.findById(same.id)) as MovieData & { id: number };
    }

    const trailer = details.videos?.results?.find(video => video.type === 'Trailer' && video.site === 'YouTube');
    const posterPath = await imageService.downloadPoster(details.poster_path ?? null, details.id).catch(() => null);
    const movie: Record<string, unknown> = {
      title,
      format,
      price: titleStatus === 'owned' ? priceOf(input.price) : null,
      acquired_date: titleStatus === 'owned' ? input.acquiredDate || new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      comments: input.comments || '',
      never_seen: false,
      original_title: details.original_title || '',
      original_language: details.original_language || '',
      release_date: details.release_date || details.first_air_date || '',
      genre: (details.genres || []).map(genre => genre.name).join(', '),
      director: details.credits?.crew?.find(person => person.job === 'Director')?.name || '',
      cast: (details.credits?.cast || []).map(actor => actor.name),
      plot: details.overview || '',
      imdb_rating: details.vote_average || null,
      rotten_tomatoes_link: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(details.title || '')}`,
      imdb_id: details.imdb_id || '',
      tmdb_id: details.id,
      tmdb_rating: details.vote_average || null,
      runtime: details.runtime || null,
      poster_path: posterPath,
      backdrop_path: null,
      budget: details.budget || null,
      revenue: details.revenue || null,
      trailer_key: trailer?.key || null,
      trailer_site: trailer?.site || null,
      status: details.status || '',
      popularity: details.popularity || null,
      vote_count: details.vote_count || null,
      adult: details.adult || false,
      video: details.video || false,
      media_type: mediaType,
      import_id: 'finder',
      title_status: titleStatus,
    };

    let created: MovieData & { id: number };
    try {
      created = await Movie.create(movie as unknown as MovieData);
    } catch (error) {
      if (isDuplicate(error)) throw new MovieFinderError(`You already have this ${format}: name what tells this one apart (a Steelbook…)`, 409);
      throw error;
    }
    enrichLater(created.id, details, mediaType);
    return created;
  },

  /**
   * A saga's movies as one box set, wished or of the collection: each movie
   * in the box's format, the box's price shared out among them, in their
   * order. A movie one already has in that format joins the box as it is.
   */
  addBoxSet: async (input: {
    name?: string; movies?: Array<{ tmdbId: number; mediaType?: string }>; titleStatus?: string; format?: string | null;
    price?: number | string | null; acquiredDate?: string | null; comments?: string | null;
  }): Promise<{ collection: { id: number; name: string }; movies: Array<MovieData & { id: number }> }> => {
    const name = (input.name || '').trim();
    const list = input.movies || [];
    if (!name) throw new MovieFinderError('A box set needs a name', 400);
    if (!list.length) throw new MovieFinderError('A box set needs its movies', 400);
    const titleStatus = input.titleStatus === 'owned' ? 'owned' : 'wish';
    const format = checkFormat(input.format);
    const total = priceOf(input.price);
    const each = total !== null ? Math.round((total / list.length) * 100) / 100 : null;

    const movies: Array<MovieData & { id: number }> = [];
    for (const item of list) {
      try {
        movies.push(await movieFinderService.addMovie({ tmdbId: item.tmdbId, mediaType: item.mediaType, titleStatus, format, price: each, acquiredDate: input.acquiredDate, comments: input.comments }));
      } catch (error) {
        if (!(error instanceof MovieFinderError) || error.status !== 409) throw error;
        // Already there in this format: it joins the box set as it is.
        const editions = await Movie.findAllByTmdbId(Number(item.tmdbId));
        const had = editions.find(edition => edition.format === format && (edition.title_status === titleStatus || edition.title_status === 'owned'));
        if (had) movies.push((await Movie.findById(had.id)) as MovieData & { id: number });
      }
    }

    let collection: { id: number; name: string } | null = null;
    for (const [i, movie] of movies.entries()) {
      const added = await collectionService.addMovieToCollection(movie.id, name, 'box_set');
      collection = { id: added.collection.id, name: added.collection.name };
      await MovieCollection.updateOrder(movie.id, added.collection.id, i + 1);
    }
    return { collection: collection!, movies };
  },

  /**
   * Wished movies bought (one, or a box set's): each becomes of the
   * collection, in the format bought, the price shared out among them.
   */
  buy: async (input: {
    movieIds?: number[]; format?: string | null; edition?: string | null; price?: number | string | null;
    acquiredDate?: string | null; comments?: string | null;
  }): Promise<Array<MovieData & { id: number }>> => {
    const ids = (input.movieIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0);
    if (!ids.length) throw new MovieFinderError('Which movies were bought?', 400);
    const format = checkFormat(input.format);
    const total = priceOf(input.price);
    const each = total !== null ? Math.round((total / ids.length) * 100) / 100 : null;
    const bought: Array<MovieData & { id: number }> = [];
    for (const id of ids) {
      const movie = await Movie.findById(id) as (MovieData & { id: number; title: string; title_status?: string }) | null;
      if (!movie) throw new MovieFinderError(`No movie ${id}`, 404);
      const fields: Record<string, unknown> = {
        title_status: 'owned', format, price: each,
        acquired_date: input.acquiredDate || new Date().toISOString().slice(0, 10),
      };
      // A Steelbook bought where a movie was wished: the edition joins its title.
      if (ids.length === 1 && input.edition && input.edition.trim()) fields.title = editionTitle(String(movie.title), input.edition);
      if (input.comments) fields.comments = input.comments;
      try {
        await Movie.updateFields(id, fields);
      } catch (error) {
        if (isDuplicate(error)) throw new MovieFinderError(`You already have ${movie.title} in ${format}`, 409);
        throw error;
      }
      bought.push((await Movie.findById(id)) as MovieData & { id: number });
    }
    return bought;
  },
};

export default movieFinderService;
