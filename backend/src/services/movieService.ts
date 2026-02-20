import Movie from '../models/movie';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import omdbService from './omdbService';
import posterService from './posterService';
import tmdbService from './tmdbService';
import { getDatabase } from '../database';
import logger from '../logger';
import collectionService from './collectionService';
import ageRecommendationService from './ageRecommendationService';
import type { MovieRow, MovieData, MovieSearchCriteria } from '../types';

interface ThumbnailResult {
  success: boolean;
  thumbnailUrl?: string;
  source?: string;
  imdbId?: string;
  error?: string;
}

interface MovieDetails {
  id: number;
  title: string | null;
  original_title: string | null;
  original_language: string | null;
  plot: string | null;
  genre: string | null;
  director: string | null;
  cast: string[];
  imdb_rating: number | null;
  rotten_tomato_rating: number | null;
  rotten_tomatoes_link: string | null;
  imdb_link: string | null;
  tmdb_link: string | null;
  tmdb_rating: number | null;
  price: number | null;
  runtime: number | null;
  comments: string | null;
  never_seen: boolean;
  release_date: string | null;
  year: number | null;
  format: string | null;
  acquired_date: string | null;
  overview: string | null;
  poster_path: string | null;
  adult: boolean;
  genres: Array<{ id: number; name: string }> | string[];
  trailer_key: string | null;
  trailer_site: string | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  backdrop_path: string | null;
  popularity: number | null;
  vote_count: number | null;
  video: boolean;
  budget: number | null;
  revenue: number | null;
  status: string | null;
  recommended_age: number | null;
  age_processed: boolean;
  title_status: string;
  media_type: string;
  last_watched: string | null;
  watch_count: number;
  credits?: unknown;
  videos?: unknown;
}

interface AutocompleteRow {
  [key: string]: string | number | null | undefined;
  collection_type?: string;
}

// Helper function to parse date from various formats
const parseDate = (dateValue: string | number | null | undefined): string | null => {
  if (!dateValue) return null;

  // If it's already a number, treat it as a year
  if (typeof dateValue === 'number') {
    if (dateValue >= 1900 && dateValue <= 2100) {
      return `${dateValue}-01-01`; // Default to January 1st
    }
    return null;
  }

  const dateStr = dateValue.toString().trim();

  // Try to parse as date string
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
};

// Helper function to parse release date from various formats
const parseReleaseDate = (dateValue: string | number | null | undefined): string | null => {
  if (!dateValue) return null;

  // If it's already a number, treat it as a year
  if (typeof dateValue === 'number') {
    if (dateValue >= 1800 && dateValue <= 2100) {
      return `${dateValue}-01-01`; // Default to January 1st
    }
    return null;
  }

  const dateStr = dateValue.toString().trim();

  // Try to parse as integer first
  const intYear = parseInt(dateStr);
  if (!isNaN(intYear)) {
    // Check if it's a valid year
    if (intYear >= 1800 && intYear <= 2100) {
      return `${intYear}-01-01`; // Default to January 1st
    }
  }

  // Try to parse as date
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  // Try to extract 4-digit year from string and convert to date
  const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0]);
    if (year >= 1800 && year <= 2100) {
      return `${year}-01-01`;
    }
  }

  return null;
};

// Helper function to generate IMDB link from title and release_date
const generateImdbLink = (title: string | null, release_date: string | null): string | null => {
  if (!title) return null;

  // Clean the title for URL
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .trim();

  // Extract year from release_date if available
  const year = release_date ? new Date(release_date).getFullYear() : null;

  // Create IMDB search URL (we'll use search since we don't have exact IMDB IDs)
  const searchQuery = encodeURIComponent(`${title} ${year || ''}`.trim());
  return `https://www.imdb.com/find?q=${searchQuery}&s=tt&ttype=ft`;
};

const movieService = {

  getAllMovies: (): Promise<MovieData[]> => {
    return Movie.findAll();
  },

  searchMovies: (criteria: MovieSearchCriteria): Promise<MovieData[]> => {
    return Movie.search(criteria);
  },

  getFormats: (): Promise<string[]> => {
    return Movie.getFormats();
  },

  getMovieById: (id: number): Promise<MovieData | null> => {
    return Movie.findById(id);
  },

  // Automatically fetch ratings for a movie
  fetchMovieRatings: async (title: string, release_date: string | null = null): Promise<{ imdbRating: number | null; rottenTomatoRating: string | null }> => {
    try {
      const year = release_date ? new Date(release_date).getFullYear() : null;
      const ratings = await omdbService.getMovieRatings(title, year);
      return ratings;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error fetching ratings:', message);
      return { imdbRating: null, rottenTomatoRating: null };
    }
  },

  // Create a movie with automatic rating fetching
  createMovieWithRatings: async (movieData: Record<string, unknown>): Promise<MovieData & { id: number }> => {
    try {
      // If ratings are missing, try to fetch them
      if (!movieData.imdb_rating || !movieData.rotten_tomato_rating) {
        logger.debug('Fetching ratings for:', movieData.title as string);
        const year = movieData.release_date ? new Date(movieData.release_date as string).getFullYear() : null;
        const ratings = await omdbService.getMovieRatings(movieData.title as string, year);

        if (ratings.imdbRating && !movieData.imdb_rating) {
          movieData.imdb_rating = ratings.imdbRating;
        }
        if (ratings.rottenTomatoRating && !movieData.rotten_tomato_rating) {
          movieData.rotten_tomato_rating = parseInt(ratings.rottenTomatoRating);
        }
      }

      // If recommended age is missing, try to fetch it
      if (!movieData.recommended_age && (movieData.tmdb_id || movieData.imdb_id)) {
        logger.debug('Fetching recommended age for:', movieData.title as string);
        try {
          // ageRecommendationService imported at top level
          const recommendedAge = movieData.media_type === 'tv'
            ? await ageRecommendationService.getRecommendedAgeForTV(movieData.tmdb_id as number | null, movieData.imdb_id as string | null)
            : await ageRecommendationService.getRecommendedAge(movieData.tmdb_id as number | null, movieData.imdb_id as string | null);

          if (recommendedAge !== null) {
            movieData.recommended_age = recommendedAge;
            movieData.age_processed = true;
          }
        } catch (ageError) {
          const ageMessage = ageError instanceof Error ? ageError.message : String(ageError);
          logger.warn('Failed to fetch recommended age for:', movieData.title as string, ageMessage);
          // Continue without age - it can be backfilled later
        }
      }

      return await Movie.create(movieData as unknown as MovieData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error creating movie with ratings:', message);
      throw error;
    }
  },



  // Get movie thumbnail from IMDB
  getMovieThumbnail: async (imdbLink: string | null, title: string | null = null, year: string | number | null = null): Promise<ThumbnailResult> => {
    try {
      if (!imdbLink) {
        return { success: false, error: 'No IMDB link provided' };
      }

      // Use the poster service to get real movie posters
      const posterResult = await posterService.getMoviePoster(imdbLink, title, year);

      return {
        success: posterResult.success,
        thumbnailUrl: posterResult.posterUrl,
        source: posterResult.source,
        imdbId: posterResult.imdbId,
        error: posterResult.error
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error fetching movie thumbnail:', error);
      return {
        success: false,
        error: message
      };
    }
  },

  // Get movie backdrop URL
  getMovieBackdrop: async (tmdbId: number | null): Promise<string | null> => {
    try {
      if (!tmdbId) {
        return null;
      }

      // Get movie details to find backdrop path
      const movieDetails = await tmdbService.getMovieDetails(tmdbId);
      if (movieDetails && movieDetails.backdrop_path) {
        return `https://image.tmdb.org/t/p/w1280${movieDetails.backdrop_path}`;
      }

      return null;
    } catch (error) {
      console.error('Error fetching movie backdrop:', error);
      return null;
    }
  },

  // Get detailed movie information combining local and TMDB data
  getMovieDetails: async (movieId: number): Promise<MovieDetails> => {
    try {
      // Get local movie data
      const localMovie = await Movie.findById(movieId);
      if (!localMovie) {
        throw new Error('Movie not found');
      }

      // Fetch TMDB data based on media type
      let tmdbData: Record<string, unknown> | null = null;
      if (localMovie.tmdb_id) {
        if (localMovie.media_type === 'tv') {
          tmdbData = await tmdbService.getTVShowDetails(localMovie.tmdb_id) as unknown as Record<string, unknown>;
        } else {
          tmdbData = await tmdbService.getMovieDetails(localMovie.tmdb_id) as unknown as Record<string, unknown>;
        }
      }

      // If no TMDB data found, try searching by title
      if (!tmdbData) {
        const year = localMovie.release_date ? new Date(localMovie.release_date).getFullYear() : null;
        tmdbData = await tmdbService.searchMovie(localMovie.title as string, year) as unknown as Record<string, unknown>;
      }

      // Combine local and TMDB data (prioritize spreadsheet data)
      const movieDetails: MovieDetails = {
        // Database ID - this is crucial for updates
        id: localMovie.id!,
        // Local database fields
        title: localMovie.title,
        original_title: localMovie.original_title || null,
        original_language: localMovie.original_language || null,
        plot: localMovie.plot,
        genre: localMovie.genre,
        director: localMovie.director,
        cast: Array.isArray(localMovie.cast) ? localMovie.cast as unknown as string[] : (localMovie.cast ? JSON.parse(localMovie.cast as string) : []),
        imdb_rating: localMovie.imdb_rating,
        rotten_tomato_rating: localMovie.rotten_tomato_rating,
        rotten_tomatoes_link: localMovie.rotten_tomatoes_link || null,
        imdb_link: (localMovie.imdb_id ? `https://www.imdb.com/title/${localMovie.imdb_id}` : null),
        tmdb_link: (localMovie.tmdb_id ? `https://www.themoviedb.org/${localMovie.media_type || 'movie'}/${localMovie.tmdb_id}` : null),
        tmdb_rating: localMovie.tmdb_rating || null,
        price: localMovie.price,
        runtime: localMovie.runtime || null,
        comments: localMovie.comments || null,
        never_seen: localMovie.never_seen || false,
        release_date: localMovie.release_date,
        year: localMovie.release_date ? new Date(localMovie.release_date as string).getFullYear() : null,
        format: localMovie.format,
        acquired_date: localMovie.acquired_date,

        // Use local data first, fall back to TMDB only if local is missing
        overview: (tmdbData?.overview as string) || localMovie.plot || null,
        poster_path: localMovie.poster_path || null,
        adult: tmdbData?.adult !== undefined ? tmdbData.adult as boolean : (localMovie.adult || false),
        genres: (tmdbData?.genres as Array<{ id: number; name: string }>) || (localMovie.genre ? [localMovie.genre] : []),
        trailer_key: localMovie.trailer_key || ((tmdbData?.videos as Record<string, Array<Record<string, unknown>>> | undefined)?.results?.[0]?.key as string | undefined) || null,
        trailer_site: localMovie.trailer_site || ((tmdbData?.videos as Record<string, Array<Record<string, unknown>>> | undefined)?.results?.[0]?.site as string | undefined) || null,
        tmdb_id: localMovie.tmdb_id || null,
        imdb_id: localMovie.imdb_id || null,
        backdrop_path: localMovie.backdrop_path || null,
        popularity: (tmdbData?.popularity as number) || localMovie.popularity || null,
        vote_count: (tmdbData?.vote_count as number) || localMovie.vote_count || null,
        video: tmdbData?.video !== undefined ? tmdbData.video as boolean : (localMovie.video || false),
        budget: (tmdbData?.budget as number) || localMovie.budget || null,
        revenue: (tmdbData?.revenue as number) || localMovie.revenue || null,
        status: (tmdbData?.status as string) || localMovie.status || null,
        recommended_age: localMovie.recommended_age || null,
        age_processed: localMovie.age_processed || false,
        title_status: localMovie.title_status || 'owned',
        media_type: localMovie.media_type || 'movie',
        last_watched: localMovie.last_watched || null,
        watch_count: localMovie.watch_count || 0
      };

      // Add TMDB-specific fields
      if (tmdbData) {
        movieDetails.credits = tmdbData.credits;
        movieDetails.videos = tmdbData.videos;
      }

      return movieDetails;
    } catch (error) {
      console.error('Error fetching movie details:', error);
      throw error;
    }
  },

  async getAutocompleteSuggestions(field: string, query: string): Promise<Array<Record<string, unknown>>> {
    try {
      const db = getDatabase();

      let sql = '';
      let params: string[] = [];

      switch (field) {
        case 'title':
          sql = `SELECT DISTINCT title FROM movies WHERE title LIKE ? ORDER BY title LIMIT 20`;
          params = [`%${query}%`];
          break;
        case 'director':
          sql = `SELECT DISTINCT director FROM movies WHERE director IS NOT NULL AND director != '' AND director LIKE ? ORDER BY director LIMIT 20`;
          params = [`%${query}%`];
          break;
        case 'genre':
          // Get all genres and split them to extract individual genre names
          sql = `SELECT DISTINCT genre FROM movies WHERE genre IS NOT NULL AND genre != '' AND genre LIKE ? ORDER BY genre LIMIT 20`;
          params = [`%${query}%`];
          break;
        case 'actor':
          // Use cast field from movies table - return full cast arrays, frontend will parse
          sql = `SELECT DISTINCT m.cast FROM movies m WHERE m.cast IS NOT NULL AND m.cast != '' AND m.cast != '[]' AND m.cast LIKE ? ORDER BY m.cast LIMIT 20`;
          params = [`%${query}%`];
          break;
        case 'collection':
          sql = `SELECT DISTINCT c.name as collection, c.type as collection_type
                 FROM collections c
                 WHERE c.name IS NOT NULL AND c.name != '' AND c.name LIKE ?
                 ORDER BY c.name LIMIT 20`;
          params = [`%${query}%`];
          break;
        case 'box_set':
          sql = `SELECT DISTINCT c.name as box_set, c.type as collection_type
                 FROM collections c
                 WHERE c.type = 'box_set' AND c.name IS NOT NULL AND c.name != '' AND c.name LIKE ?
                 ORDER BY c.name LIMIT 20`;
          params = [`%${query}%`];
          break;
        case 'format':
          sql = `SELECT DISTINCT format FROM movies WHERE format IS NOT NULL AND format != '' AND format LIKE ? ORDER BY format LIMIT 20`;
          params = [`%${query}%`];
          break;
        case 'year':
          sql = `SELECT DISTINCT strftime('%Y', release_date) as year FROM movies WHERE release_date IS NOT NULL AND release_date LIKE ? ORDER BY year DESC LIMIT 20`;
          params = [`%${query}%`];
          break;
        case 'original_language':
          // Return language codes directly, not display names
          sql = `SELECT DISTINCT original_language FROM movies WHERE original_language IS NOT NULL AND original_language != '' AND original_language LIKE ? ORDER BY original_language LIMIT 20`;
          params = [`%${query}%`];
          break;
        case 'media_type':
          sql = `SELECT DISTINCT media_type FROM movies WHERE media_type IS NOT NULL AND media_type != '' AND media_type LIKE ? ORDER BY media_type LIMIT 20`;
          params = [`%${query}%`];
          break;
        case 'minImdbRating':
        case 'minRottenTomatoRating':
          // These are numeric fields, no autocomplete needed
          return [];
        default:
          return [];
      }

      const rows = await new Promise<AutocompleteRow[]>((resolve, reject) => {
      db.all(sql, params, (err: Error | null, rows: AutocompleteRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
      });
      // Return proper object format for frontend
      let processedRows = rows.map(row => {
        const value = row[field] || row.actor || row.year || row.collection || row.cast || row.original_language || row.media_type;
        const result: Record<string, unknown> = { [field]: value };

        // For collections, include collection_type
        if (field === 'collection' || field === 'box_set') {
          result.collection_type = row.collection_type;
        }

        return result;
      });

      // Special processing for genre field - split comma-separated genres
      if (field === 'genre') {
        const allGenres = new Set<string>();
        processedRows.forEach(row => {
          const genreString = row.genre as string;
          if (genreString) {
            // Split by comma and clean up each genre
            const genres = genreString.split(',').map(g => g.trim()).filter(g => g.length > 0);
            genres.forEach(genre => {
              if (genre.toLowerCase().includes(query.toLowerCase())) {
                allGenres.add(genre);
              }
            });
          }
        });

        // Convert back to array format
        processedRows = Array.from(allGenres).slice(0, 20).map(genre => ({ [field]: genre }));
      }

      return processedRows;
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      return [];
    }
  },

  updateMovie: async (id: number, movieData: Record<string, unknown>): Promise<MovieData | null> => {
    try {
      // First check if the movie exists
      const existingMovie = await Movie.findById(id);
      if (!existingMovie) {
        return null; // Movie not found
      }

      // Ensure all fields from existingMovie are present in movieData if missing
      for (const key in existingMovie) {
        if (
          Object.prototype.hasOwnProperty.call(existingMovie, key) &&
          movieData[key] === undefined
        ) {
          movieData[key] = (existingMovie as unknown as Record<string, unknown>)[key];
        }
      }

      // Update the movie in the database
      const result = await Movie.update(id, movieData as unknown as MovieData);

      if (result.changes === 0) {
        return null; // No changes made, movie not found
      }

      // Return the updated movie data with parsed cast field
      const updatedMovie = await Movie.findById(id);
      if (updatedMovie) {
        // Parse cast field from JSON string back to array
        (updatedMovie as unknown as Record<string, unknown>).cast = Array.isArray(updatedMovie.cast) ? updatedMovie.cast : (updatedMovie.cast ? JSON.parse(updatedMovie.cast as string) : []);
      }
      return updatedMovie;
    } catch (error) {
      console.error('Error updating movie:', error);
      throw error;
    }
  },

  deleteMovie: async (id: number): Promise<{ id: number; deletedRows: number }> => {
    const db = getDatabase();
    return new Promise(async (resolve, reject) => {
      try {
        // Delete the movie
        db.run('DELETE FROM movies WHERE id = ?', [id], async function(this: { changes: number }, err: Error | null) {
          if (err) {
            reject(err);
          } else {
            // Clean up empty collections after movie deletion
            try {
              await collectionService.cleanupEmptyCollections();
              logger.info(`Cleaned up empty collections after deleting movie ${id}`);
            } catch (cleanupError) {
              logger.warn('Failed to cleanup empty collections after movie deletion:', cleanupError);
              // Don't fail the deletion if cleanup fails
            }

            resolve({ id, deletedRows: this.changes });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // Refresh movie ratings from external sources
  refreshMovieRatings: async (movieId: number): Promise<MovieData> => {
    try {
      // Get the current movie data
      const movie = await Movie.findById(movieId);
      if (!movie) {
        throw new Error('Movie not found');
      }

      // If no TMDB ID, try to find it by searching
      let tmdbData: Record<string, unknown> | null = null;
      if (movie.tmdb_id) {
        // Get fresh TMDB data
        if (movie.media_type === 'tv') {
          tmdbData = await tmdbService.getTVShowDetails(movie.tmdb_id) as unknown as Record<string, unknown>;
        } else {
          tmdbData = await tmdbService.getMovieDetails(movie.tmdb_id) as unknown as Record<string, unknown>;
        }
      } else {
        // Search for TMDB data by title
        const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null;
        tmdbData = await tmdbService.searchMovie(movie.title as string, year) as unknown as Record<string, unknown>;
      }

      if (!tmdbData) {
        throw new Error('Could not fetch TMDB data');
      }

      // Get OMDB ratings if we have IMDB ID
      let imdbRating: number | null = null;
      let rottenTomatoRating: number | null = null;
      if (tmdbData.imdb_id) {
        try {
          const omdbData = await omdbService.getMovieByImdbId(tmdbData.imdb_id as string);
          imdbRating = omdbData?.imdbRating ? parseFloat(String(omdbData.imdbRating)) : null;
          rottenTomatoRating = omdbData?.rottenTomatoRating ? parseInt(String(omdbData.rottenTomatoRating)) : null;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn('Failed to fetch OMDB ratings:', message);
        }
      } else {
        // Try to get OMDB data by title as fallback
        try {
          const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null;
          const omdbData = await omdbService.searchMovie(movie.title as string, year);
          imdbRating = omdbData?.imdbRating ? parseFloat(String(omdbData.imdbRating)) : null;
          rottenTomatoRating = omdbData?.rottenTomatoRating ? parseInt(String(omdbData.rottenTomatoRating)) : null;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn('Failed to fetch OMDB ratings by title:', message);
        }
      }

      // Update only the ratings and related fields, preserve all other data
      const updateData: Record<string, unknown> = {
        tmdb_rating: tmdbData.vote_average || movie.tmdb_rating,
        imdb_rating: imdbRating || movie.imdb_rating,
        rotten_tomato_rating: rottenTomatoRating || movie.rotten_tomato_rating,
        vote_count: tmdbData.vote_count || movie.vote_count,
        popularity: tmdbData.popularity || movie.popularity,
        // Update TMDB ID if we found it and didn't have it before
        tmdb_id: movie.tmdb_id || tmdbData.id,
        // Update IMDB ID if we found it and didn't have it before
        imdb_id: movie.imdb_id || tmdbData.imdb_id
      };

      // Update in database - use updateFields to preserve existing data
      await Movie.updateFields(movieId, updateData);

      // Return updated movie data
      const updatedMovie = await Movie.findById(movieId);
      return updatedMovie!;

    } catch (error) {
      console.error('Error refreshing movie ratings:', error);
      throw error;
    }
  }
};

export default movieService;
