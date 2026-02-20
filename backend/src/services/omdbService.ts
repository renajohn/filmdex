import axios, { type AxiosResponse } from 'axios';
import configManager from '../config';

const OMDB_BASE_URL = 'http://www.omdbapi.com/';

interface OMDBResponse {
  Response: string;
  Error?: string;
  Title?: string;
  Year?: string;
  imdbID?: string;
  imdbRating?: string;
  Plot?: string;
  Director?: string;
  Genre?: string;
  Actors?: string;
  Poster?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
}

interface OMDBMovieResult {
  title: string;
  year: number;
  imdbID: string | null;
  imdbRating: number | null;
  rottenTomatoRating: string | null;
  plot: string | null;
  director: string | null;
  genre: string | null;
  cast: string[];
}

interface OMDBRatingsResult {
  imdbRating: number | null;
  rottenTomatoRating: string | null;
}

const getOmdbApiKey = (): string => {
  try {
    return configManager.getApiKeys().omdb || process.env.OMDB_API_KEY || 'demo';
  } catch (error) {
    return process.env.OMDB_API_KEY || 'demo';
  }
};

const omdbService = {
  // Search for a movie by title and year
  searchMovie: async (title: string, year: number | null = null): Promise<OMDBMovieResult> => {
    try {
      const params: Record<string, string | number> = {
        apikey: getOmdbApiKey(),
        t: title,
        type: 'movie',
        plot: 'short'
      };

      if (year) {
        params.y = year;
      }

      const response: AxiosResponse<unknown> = await axios.get(OMDB_BASE_URL, { params });
      const data = response.data as OMDBResponse;

      if (data.Response === 'False') {
        throw new Error(data.Error || 'Movie not found');
      }

      return {
        title: data.Title ?? '',
        year: parseInt(data.Year ?? '0'),
        imdbID: data.imdbID !== 'N/A' ? (data.imdbID ?? null) : null,
        imdbRating: data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating ?? '0') : null,
        rottenTomatoRating: data.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value?.replace('%', '') || null,
        plot: data.Plot !== 'N/A' ? (data.Plot ?? null) : null,
        director: data.Director !== 'N/A' ? (data.Director ?? null) : null,
        genre: data.Genre !== 'N/A' ? (data.Genre ?? null) : null,
        cast: data.Actors !== 'N/A' ? (data.Actors ?? '').split(',').map(actor => actor.trim()).filter(actor => actor) : []
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('OMDB API error:', message);
      throw new Error(`Failed to fetch movie data: ${message}`);
    }
  },

  // Get movie ratings only (lighter API call)
  getMovieRatings: async (title: string, year: number | null = null): Promise<OMDBRatingsResult> => {
    try {
      const params: Record<string, string | number> = {
        apikey: getOmdbApiKey(),
        t: title,
        type: 'movie'
      };

      if (year) {
        params.y = year;
      }

      const response: AxiosResponse<unknown> = await axios.get(OMDB_BASE_URL, { params });
      const data = response.data as OMDBResponse;

      if (data.Response === 'False') {
        return { imdbRating: null, rottenTomatoRating: null };
      }

      const imdbRating = data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating ?? '0') : null;
      const rottenTomatoRating = data.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value?.replace('%', '') || null;

      return { imdbRating, rottenTomatoRating };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('OMDB API error:', message);
      return { imdbRating: null, rottenTomatoRating: null };
    }
  },

  // Get movie by IMDB ID
  getMovieByImdbId: async (imdbId: string): Promise<OMDBMovieResult> => {
    try {
      const params: Record<string, string> = {
        apikey: getOmdbApiKey(),
        i: imdbId,
        plot: 'short'
      };

      const response: AxiosResponse<unknown> = await axios.get(OMDB_BASE_URL, { params });
      const data = response.data as OMDBResponse;

      if (data.Response === 'False') {
        throw new Error(data.Error || 'Movie not found');
      }

      return {
        title: data.Title ?? '',
        year: parseInt(data.Year ?? '0'),
        imdbID: data.imdbID !== 'N/A' ? (data.imdbID ?? null) : null,
        imdbRating: data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating ?? '0') : null,
        rottenTomatoRating: data.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value?.replace('%', '') || null,
        plot: data.Plot !== 'N/A' ? (data.Plot ?? null) : null,
        director: data.Director !== 'N/A' ? (data.Director ?? null) : null,
        genre: data.Genre !== 'N/A' ? (data.Genre ?? null) : null,
        cast: data.Actors !== 'N/A' ? (data.Actors ?? '').split(',').map(actor => actor.trim()).filter(actor => actor) : []
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('OMDB API error:', message);
      throw new Error(`Failed to fetch movie data: ${message}`);
    }
  }
};

export default omdbService;
