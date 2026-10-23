import axios, { type AxiosResponse } from 'axios';
import configManager from '../config';
import type { TMDBSearchResult, TMDBMovieDetails, TMDBGenre } from '../types';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface TMDBSearchResponse {
  results: TMDBSearchResult[];
  total_results: number;
  total_pages: number;
}

interface TMDBGenreListResponse {
  genres: TMDBGenre[];
}

interface TMDBImagesResponse {
  posters: TMDBPoster[];
}

interface TMDBPoster {
  file_path: string;
  width: number;
  height: number;
  iso_639_1: string | null;
  vote_average: number;
  vote_count: number;
}

interface TMDBExternalIdsResponse {
  imdb_id: string | null;
}

interface TMDBCreditsResponse {
  cast: Array<{
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
    order: number;
  }>;
  crew: Array<{
    id: number;
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
  }>;
}

interface TMDBVideosResponse {
  results: Array<{
    key: string;
    site: string;
    type: string;
    official?: boolean;
  }>;
}

interface FormattedSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date: string | undefined;
  overview: string | undefined;
  poster_path: string | null | undefined;
  backdrop_path: string | null | undefined;
  vote_average: number | undefined;
  vote_count: number | undefined;
  popularity: number | undefined;
  adult: boolean | undefined;
  video: boolean;
  media_type: string;
  first_air_date?: string;
  origin_country?: string[];
}

interface FormattedMovieDetails {
  poster_path: string | null | undefined;
  adult: boolean | undefined;
  overview: string | undefined;
  release_date: string | undefined;
  genres: Array<{ id: number; name: string }> | undefined;
  id: number;
  original_title: string | undefined;
  original_language: string | undefined;
  title: string | undefined;
  backdrop_path: string | null | undefined;
  popularity: number | undefined;
  vote_count: number | undefined;
  video: boolean | undefined;
  vote_average: number | undefined;
  runtime: number | null | undefined;
  budget: number | null | undefined;
  revenue: number | null | undefined;
  status: string | undefined;
  imdb_id: string | null;
  media_type: string;
  credits: {
    cast: Array<{ id: number; name: string; character: string; profile_path: string | null }>;
    crew: Array<{ id: number; name: string; job: string; department: string; profile_path: string | null }>;
  };
  videos: {
    results: Array<{ key: string; site: string; type: string }>;
  };
  first_air_date?: string;
  last_air_date?: string;
  number_of_episodes?: number;
  number_of_seasons?: number;
  origin_country?: string[];
}

interface FormattedPoster {
  file_path: string;
  width: number;
  height: number;
  iso_639_1: string | null;
  vote_average: number;
  vote_count: number;
}

const getTmdbApiKey = (): string | undefined => {
  try {
    return configManager.getApiKeys().tmdb || process.env.TMDB_API_KEY;
  } catch (error) {
    return process.env.TMDB_API_KEY;
  }
};

/* What the finder asks TMDB again and again as a search is refined: kept an hour. */
const KEEP_MS = 60 * 60 * 1000;
const kept = new Map<string, { at: number; value: Promise<unknown> }>();
const tmdbGet = <T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> => {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return Promise.reject(new Error('TMDB_API_KEY not configured'));
  const key = `${path}?${JSON.stringify(params)}`;
  const known = kept.get(key);
  if (known && Date.now() - known.at < KEEP_MS) return known.value as Promise<T>;
  const value = axios.get(`${TMDB_BASE_URL}${path}`, { params: { ...params, api_key: apiKey }, timeout: 10000 }).then(response => response.data as T);
  kept.set(key, { at: Date.now(), value });
  value.catch(() => kept.delete(key));
  return value;
};

/** For tests: forget what TMDB said. */
export const forgetTmdbAnswers = (): void => kept.clear();

export interface TMDBPersonFound {
  id: number;
  name: string;
  known_for_department?: string;
  profile_path?: string | null;
  popularity?: number;
  known_for?: Array<{ id: number; media_type?: string; title?: string; name?: string; poster_path?: string | null; release_date?: string }>;
}

export interface TMDBCreditedMovie {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  popularity?: number;
  job?: string;
  character?: string;
}

export interface TMDBCollectionFound {
  id: number;
  name: string;
  poster_path?: string | null;
}

export interface TMDBCollectionDetails {
  id: number;
  name: string;
  poster_path?: string | null;
  parts: Array<{ id: number; title: string; original_title?: string; release_date?: string; poster_path?: string | null; popularity?: number }>;
}

const tmdbService = {
  /** The people a search names, best known first. */
  searchPeople: async (query: string): Promise<TMDBPersonFound[]> =>
    (await tmdbGet<{ results?: TMDBPersonFound[] }>('/search/person', { query, include_adult: false })).results || [],

  /** The movies a person directed and played in. */
  getPersonMovieCredits: (personId: number): Promise<{ cast: TMDBCreditedMovie[]; crew: TMDBCreditedMovie[] }> =>
    tmdbGet<{ cast?: TMDBCreditedMovie[]; crew?: TMDBCreditedMovie[] }>(`/person/${personId}/movie_credits`)
      .then(data => ({ cast: data.cast || [], crew: data.crew || [] })),

  /** A person's name and face. */
  getPerson: (personId: number): Promise<{ id: number; name: string; profile_path?: string | null; known_for_department?: string }> =>
    tmdbGet(`/person/${personId}`),

  /** The sagas (TMDB's collections) a search names. */
  searchCollections: async (query: string): Promise<TMDBCollectionFound[]> =>
    (await tmdbGet<{ results?: TMDBCollectionFound[] }>('/search/collection', { query })).results || [],

  /** A saga and its movies. */
  getCollection: (collectionId: number): Promise<TMDBCollectionDetails> =>
    tmdbGet<TMDBCollectionDetails>(`/collection/${collectionId}`).then(data => ({ ...data, parts: data.parts || [] })),

  /** A movie's or a series' actors and the parts they play. */
  getCredits: async (tmdbId: number, mediaType: string = 'movie'): Promise<TMDBCreditsResponse['cast']> =>
    (await tmdbGet<Partial<TMDBCreditsResponse>>(`/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}/credits`)).cast || [],

  /** Who made a movie: its directors, for a search's results. */
  getMovieDirectors: async (tmdbId: number, mediaType: string = 'movie'): Promise<string[]> => {
    if (mediaType === 'tv') {
      const tv = await tmdbGet<{ created_by?: Array<{ name: string }> }>(`/tv/${tmdbId}`);
      return (tv.created_by || []).map(person => person.name);
    }
    const credits = await tmdbGet<TMDBCreditsResponse>(`/movie/${tmdbId}/credits`);
    return (credits.crew || []).filter(person => person.job === 'Director').map(person => person.name);
  },


  // Search for multiple movies by title and year
  searchMovies: async (query: string, year: number | string | null = null): Promise<FormattedSearchResult[]> => {
    try {
      const apiKey = getTmdbApiKey();
      if (!apiKey) {
        console.warn('TMDB_API_KEY not found, returning empty array for external data');
        return [];
      }

      const params: Record<string, string | number | boolean> = {
        api_key: apiKey,
        query: query,
        include_adult: false
      };

      if (year) {
        params.year = year;
      }

      const response: AxiosResponse<unknown> = await axios.get(`${TMDB_BASE_URL}/search/movie`, { params });
      const data = response.data as TMDBSearchResponse;

      if (!data.results || data.results.length === 0) {
        return [];
      }

      // Return all results, formatted for our application
      return data.results.map((movie: TMDBSearchResult) => ({
        id: movie.id,
        title: movie.title ?? '',
        original_title: movie.original_title ?? '',
        release_date: movie.release_date,
        overview: movie.overview,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        vote_average: movie.vote_average,
        vote_count: movie.vote_count,
        popularity: movie.popularity,
        adult: movie.adult,
        video: movie.video ?? false,
        media_type: 'movie' as const
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('TMDB search error:', message);
      return [];
    }
  },

  // Search for TV shows by title and year
  searchTVShows: async (query: string, year: number | string | null = null): Promise<FormattedSearchResult[]> => {
    try {
      if (!getTmdbApiKey()) {
        console.warn('TMDB_API_KEY not found, returning empty array for external data');
        return [];
      }

      const params: Record<string, string | number | boolean> = {
        api_key: getTmdbApiKey()!,
        query: query,
        include_adult: false
      };

      if (year) {
        params.first_air_date_year = year;
      }

      const response: AxiosResponse<unknown> = await axios.get(`${TMDB_BASE_URL}/search/tv`, { params });
      const data = response.data as TMDBSearchResponse;

      if (!data.results || data.results.length === 0) {
        return [];
      }

      // Return all results, formatted for our application
      return data.results.map((tv: TMDBSearchResult) => ({
        id: tv.id,
        title: tv.name ?? '',
        original_title: tv.original_name ?? '',
        release_date: tv.first_air_date,
        overview: tv.overview,
        poster_path: tv.poster_path,
        backdrop_path: tv.backdrop_path,
        vote_average: tv.vote_average,
        vote_count: tv.vote_count,
        popularity: tv.popularity,
        adult: tv.adult,
        video: false,
        media_type: 'tv' as const,
        first_air_date: tv.first_air_date,
        origin_country: (tv as unknown as { origin_country?: string[] }).origin_country
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('TMDB TV search error:', message);
      return [];
    }
  },

  // Combined search for both movies and TV shows
  searchAll: async (query: string, year: number | string | null = null): Promise<FormattedSearchResult[]> => {
    try {
      const [movies, tvShows] = await Promise.all([
        tmdbService.searchMovies(query, year),
        tmdbService.searchTVShows(query, year)
      ]);

      // Combine and sort by popularity
      const allResults = [...movies, ...tvShows];
      return allResults.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('TMDB combined search error:', message);
      return [];
    }
  },

  // Search for a movie by title and year (returns single result)
  searchMovie: async (title: string, year: number | null = null): Promise<FormattedMovieDetails | null> => {
    try {
      if (!getTmdbApiKey()) {
        console.warn('TMDB_API_KEY not found, returning null for external data');
        return null;
      }

      const params: Record<string, string | number | boolean> = {
        api_key: getTmdbApiKey()!,
        query: title,
        include_adult: false
      };

      if (year) {
        params.year = year;
      }

      const response: AxiosResponse<unknown> = await axios.get(`${TMDB_BASE_URL}/search/movie`, { params });
      const data = response.data as TMDBSearchResponse;

      if (!data.results || data.results.length === 0) {
        return null;
      }

      // Return the first result
      const movie = data.results[0];

      return await tmdbService.getMovieDetails(movie.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('TMDB search error:', message);
      return null;
    }
  },

  // Get detailed movie information including cast and videos
  getMovieDetails: async (tmdbId: number): Promise<FormattedMovieDetails | null> => {
    try {
      if (!getTmdbApiKey()) {
        console.warn('TMDB_API_KEY not found, returning null for external data');
        return null;
      }

      const [movieResponse, creditsResponse, videosResponse, externalIdsResponse] = await Promise.all([
        axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}`, {
          params: { api_key: getTmdbApiKey() }
        }),
        axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}/credits`, {
          params: { api_key: getTmdbApiKey() }
        }),
        axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}/videos`, {
          params: { api_key: getTmdbApiKey() }
        }),
        axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}/external_ids`, {
          params: { api_key: getTmdbApiKey() }
        })
      ]) as [AxiosResponse<unknown>, AxiosResponse<unknown>, AxiosResponse<unknown>, AxiosResponse<unknown>];

      const movie = movieResponse.data as TMDBMovieDetails;
      const credits = creditsResponse.data as TMDBCreditsResponse;
      const videos = videosResponse.data as TMDBVideosResponse;
      const externalIds = externalIdsResponse.data as TMDBExternalIdsResponse;

      // Find the official trailer
      const trailer = videos.results.find(video =>
        video.type === 'Trailer' &&
        video.site === 'YouTube'
      );

      const movieData: FormattedMovieDetails = {
        poster_path: movie.poster_path,
        adult: movie.adult,
        overview: movie.overview,
        release_date: movie.release_date,
        genres: movie.genres,
        id: movie.id,
        original_title: movie.original_title,
        original_language: movie.original_language,
        title: movie.title,
        backdrop_path: movie.backdrop_path,
        popularity: movie.popularity,
        vote_count: movie.vote_count,
        video: movie.video,
        vote_average: movie.vote_average,
        runtime: movie.runtime ?? null,
        budget: movie.budget ?? null,
        revenue: movie.revenue ?? null,
        status: movie.status,
        imdb_id: externalIds.imdb_id ?? null,
        media_type: 'movie',
        credits: {
          cast: credits.cast.slice(0, 10).map(actor => ({
            id: actor.id,
            name: actor.name,
            character: actor.character,
            profile_path: actor.profile_path
          })),
          crew: credits.crew.map(person => ({
            id: person.id,
            name: person.name,
            job: person.job,
            department: person.department,
            profile_path: person.profile_path
          }))
        },
        videos: {
          results: trailer ? [{
            key: trailer.key,
            site: trailer.site,
            type: trailer.type
          }] : []
        }
      };

      return movieData;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('TMDB details error:', message);
      return null;
    }
  },

  // Get detailed TV show information
  getTVShowDetails: async (tmdbId: number): Promise<FormattedMovieDetails | null> => {
    try {
      if (!getTmdbApiKey()) {
        console.warn('TMDB_API_KEY not found, returning null for external data');
        return null;
      }

      const [tvResponse, creditsResponse, videosResponse, externalIdsResponse] = await Promise.all([
        axios.get(`${TMDB_BASE_URL}/tv/${tmdbId}`, {
          params: { api_key: getTmdbApiKey() }
        }),
        axios.get(`${TMDB_BASE_URL}/tv/${tmdbId}/credits`, {
          params: { api_key: getTmdbApiKey() }
        }),
        axios.get(`${TMDB_BASE_URL}/tv/${tmdbId}/videos`, {
          params: { api_key: getTmdbApiKey() }
        }),
        axios.get(`${TMDB_BASE_URL}/tv/${tmdbId}/external_ids`, {
          params: { api_key: getTmdbApiKey() }
        })
      ]) as [AxiosResponse<unknown>, AxiosResponse<unknown>, AxiosResponse<unknown>, AxiosResponse<unknown>];

      interface TVShowData {
        poster_path: string | null;
        adult: boolean;
        overview: string;
        first_air_date: string;
        last_air_date: string;
        genres: Array<{ id: number; name: string }>;
        id: number;
        original_name: string;
        original_language: string;
        name: string;
        backdrop_path: string | null;
        popularity: number;
        vote_count: number;
        vote_average: number;
        episode_run_time: number[];
        status: string;
        number_of_episodes: number;
        number_of_seasons: number;
        origin_country: string[];
      }

      const tv = tvResponse.data as TVShowData;
      const credits = creditsResponse.data as TMDBCreditsResponse;
      const videos = videosResponse.data as TMDBVideosResponse;
      const externalIds = externalIdsResponse.data as TMDBExternalIdsResponse;

      // Find the official trailer
      const trailer = videos.results.find(video =>
        video.type === 'Trailer' &&
        video.site === 'YouTube'
      );

      const tvData: FormattedMovieDetails = {
        poster_path: tv.poster_path,
        adult: tv.adult,
        overview: tv.overview,
        release_date: tv.first_air_date,
        genres: tv.genres,
        id: tv.id,
        original_title: tv.original_name,
        original_language: tv.original_language,
        title: tv.name,
        backdrop_path: tv.backdrop_path,
        popularity: tv.popularity,
        vote_count: tv.vote_count,
        video: false,
        vote_average: tv.vote_average,
        runtime: tv.episode_run_time && tv.episode_run_time.length > 0 ? tv.episode_run_time[0] : null,
        budget: null, // TV shows don't have budget
        revenue: null, // TV shows don't have revenue
        status: tv.status,
        imdb_id: externalIds.imdb_id ?? null,
        media_type: 'tv',
        first_air_date: tv.first_air_date,
        last_air_date: tv.last_air_date,
        number_of_episodes: tv.number_of_episodes,
        number_of_seasons: tv.number_of_seasons,
        origin_country: tv.origin_country,
        credits: {
          cast: credits.cast.slice(0, 10).map(actor => ({
            id: actor.id,
            name: actor.name,
            character: actor.character,
            profile_path: actor.profile_path
          })),
          crew: credits.crew.map(person => ({
            id: person.id,
            name: person.name,
            job: person.job,
            department: person.department,
            profile_path: person.profile_path
          }))
        },
        videos: {
          results: trailer ? [{
            key: trailer.key,
            site: trailer.site,
            type: trailer.type
          }] : []
        }
      };

      return tvData;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('TMDB TV details error:', message);
      return null;
    }
  },

  // Get TMDB genres (both movie and TV)
  getGenres: async (): Promise<TMDBGenre[]> => {
    try {
      if (!getTmdbApiKey()) {
        console.warn('TMDB_API_KEY not found, returning empty array for genres');
        return [];
      }

      const [movieGenres, tvGenres] = await Promise.all([
        axios.get(`${TMDB_BASE_URL}/genre/movie/list`, {
          params: { api_key: getTmdbApiKey() }
        }),
        axios.get(`${TMDB_BASE_URL}/genre/tv/list`, {
          params: { api_key: getTmdbApiKey() }
        })
      ]) as [AxiosResponse<unknown>, AxiosResponse<unknown>];

      const movieData = movieGenres.data as TMDBGenreListResponse;
      const tvData = tvGenres.data as TMDBGenreListResponse;

      // Combine and deduplicate genres
      const allGenres = [...movieData.genres, ...tvData.genres];
      const uniqueGenres = allGenres.filter((genre, index, self) =>
        index === self.findIndex(g => g.id === genre.id)
      );

      return uniqueGenres;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('TMDB genres error:', message);
      return [];
    }
  },

  // Get available posters for a movie or TV show
  getMoviePosters: async (tmdbId: number, mediaType: string = 'movie'): Promise<FormattedPoster[]> => {
    try {
      const apiKey = getTmdbApiKey();
      if (!apiKey) {
        console.warn('TMDB_API_KEY not found');
        return [];
      }

      // Use correct endpoint based on media type
      const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
      const response: AxiosResponse<unknown> = await axios.get(`${TMDB_BASE_URL}/${endpoint}/${tmdbId}/images`, {
        params: {
          api_key: apiKey,
          include_image_language: 'en,null' // Get English and language-neutral posters
        }
      });

      const data = response.data as TMDBImagesResponse;

      if (!data.posters) {
        return [];
      }

      // Return posters sorted by vote average (most popular first)
      return data.posters
        .sort((a, b) => b.vote_average - a.vote_average)
        .map(poster => ({
          file_path: poster.file_path,
          width: poster.width,
          height: poster.height,
          iso_639_1: poster.iso_639_1,
          vote_average: poster.vote_average,
          vote_count: poster.vote_count
        }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('TMDB posters error:', message);
      return [];
    }
  }
};

export default tmdbService;
