import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import movieService from '../services/movieService';
import tmdbService from '../services/tmdbService';
import omdbService from '../services/omdbService';
import importService from '../services/importService';
import imageService from '../services/imageService';
import collectionService from '../services/collectionService';
import cacheService from '../services/cacheService';
import coverScanService from '../services/coverScanService';
import ageRecommendationService from '../services/ageRecommendationService';
import Movie from '../models/movie';
import MovieCast from '../models/movieCast';
import MovieCrew from '../models/movieCrew';
import logger from '../logger';
import type { MovieData, MovieRow, MovieSearchCriteria } from '../types';

// Configure multer for poster uploads
const storage = multer.diskStorage({
  destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const customPosterDir = path.join(imageService.getLocalImagesDir(), 'posters', 'custom');
    // Ensure directory exists
    if (!fs.existsSync(customPosterDir)) {
      fs.mkdirSync(customPosterDir, { recursive: true });
    }
    cb(null, customPosterDir);
  },
  filename: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const movieId = (req as Request).params.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `movie_${movieId}_${timestamp}${ext}`);
  }
});

const posterUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept images only
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  }
});

const movieController = {
  getAllMovies: async (req: Request, res: Response): Promise<void> => {
    try {
      // Only return owned movies by default (for collection view)
      const movies = await Movie.findByStatus('owned');
      // Parse cast field from JSON string back to array and validate image paths
      const parsedMovies = movies.map((movie: MovieData) => {
        const validatedMovie = Movie.validateImagePaths(movie);
        return {
          ...validatedMovie,
          cast: Array.isArray(validatedMovie.cast) ? validatedMovie.cast : (validatedMovie.cast ? JSON.parse(validatedMovie.cast as string) : [])
        };
      });
      res.json(parsedMovies);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  searchMovies: async (req: Request, res: Response): Promise<void> => {
    try {
      const criteria = req.query as unknown as MovieSearchCriteria;
      const movies = await movieService.searchMovies(criteria);
      // Parse cast field from JSON string back to array and validate image paths
      const parsedMovies = movies.map((movie: MovieData) => {
        const validatedMovie = Movie.validateImagePaths(movie);
        return {
          ...validatedMovie,
          cast: Array.isArray(validatedMovie.cast) ? validatedMovie.cast : (validatedMovie.cast ? JSON.parse(validatedMovie.cast as string) : [])
        };
      });
      res.json(parsedMovies);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Search movies using TMDB API for adding new movies
  searchMoviesTMDB: async (req: Request, res: Response): Promise<void> => {
    try {
      const { query, year } = req.query;

      if (!query) {
        res.status(400).json({ error: 'Query parameter is required' });
        return;
      }

      const movies = await tmdbService.searchMovies(query as string, year as string | undefined);
      res.json(movies);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // New combined search for movies and TV shows
  searchAllTMDB: async (req: Request, res: Response): Promise<void> => {
    try {
      const { query, year } = req.query;

      if (!query) {
        res.status(400).json({ error: 'Query parameter is required' });
        return;
      }

      const results = await tmdbService.searchAll(query as string, year as string | undefined);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Fetch ratings for a movie
  fetchRatings: async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, year } = req.query;
      if (!title) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      const ratings = await movieService.fetchMovieRatings(title as string, year as string | undefined);
      res.json(ratings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Create a new movie
  createMovie: async (req: Request, res: Response): Promise<void> => {
    try {
      const movieData = req.body;

      // Validate required fields
      if (!movieData.title) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      const result = await movieService.createMovieWithRatings(movieData);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Update an existing movie
  updateMovie: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const movieData = req.body;

      const result = await movieService.updateMovie(id, movieData);
      if (!result) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      res.json(result);
    } catch (error) {
      // Check for unique constraint violation
      if ((error as Error).message && (error as Error).message.includes('UNIQUE constraint failed')) {
        // Extract which constraint failed
        if ((error as Error).message.includes('idx_movie_edition_unique') ||
            (error as Error).message.includes('movies.title') ||
            (error as Error).message.includes('movies.tmdb_id') ||
            (error as Error).message.includes('movies.format')) {
          res.status(409).json({
            error: 'A movie with this title, TMDB ID, and format already exists in your collection. Please use a different title or format to distinguish this edition.',
            code: 'DUPLICATE_EDITION'
          });
          return;
        }
      }

      logger.error('Error updating movie:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get a single movie by ID
  getMovieById: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const movie = await movieService.getMovieById(id);

      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      res.json(movie);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Export movies as CSV
  exportCSV: async (req: Request, res: Response): Promise<void> => {
    try {
      const movies = await movieService.getAllMovies();

      // Get selected columns from query parameter
      const selectedColumns = req.query.columns ? (req.query.columns as string).split(',') : [
        'title', 'original_title', 'original_language', 'genre', 'director', 'cast',
        'release_date', 'format', 'imdb_rating', 'rotten_tomato_rating', 'tmdb_rating',
        'tmdb_id', 'imdb_id', 'price', 'runtime', 'plot', 'comments',
        'acquired_date', 'budget', 'revenue', 'trailer_key', 'trailer_site', 'status',
        'popularity', 'vote_count', 'media_type', 'recommended_age', 'title_status'
      ];

      // Validate columns - only allow meaningful columns
      const allowedColumns = [
        'title', 'original_title', 'original_language', 'genre', 'director', 'cast',
        'release_date', 'format', 'imdb_rating', 'rotten_tomato_rating', 'tmdb_rating',
        'tmdb_id', 'imdb_id', 'price', 'runtime', 'plot', 'comments',
        'acquired_date', 'budget', 'revenue', 'trailer_key', 'trailer_site', 'status',
        'popularity', 'vote_count', 'media_type', 'recommended_age', 'title_status'
      ];

      const validColumns = selectedColumns.filter((col: string) => allowedColumns.includes(col));

      if (validColumns.length === 0) {
        res.status(400).json({ error: 'No valid columns selected for export' });
        return;
      }

      // Create CSV header
      const csvHeader = validColumns.map((col: string) => {
        // Convert snake_case to Title Case for headers
        return col.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      }).join(',') + '\n';

      // Create CSV rows
      const csvRows = movies.map((movie: MovieData) => {
        return validColumns.map((col: string) => {
          let value = (movie as unknown as Record<string, unknown>)[col];

          // Handle special cases
          if (col === 'cast' && Array.isArray(value)) {
            value = (value as string[]).join('; ');
          }
          if (value === null || value === undefined) {
            value = '';
          }

          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',');
      }).join('\n');

      const csvContent = csvHeader + csvRows;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="movies.csv"');
      res.send(csvContent);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get movie thumbnail
  getMovieThumbnail: async (req: Request, res: Response): Promise<void> => {
    try {
      const { imdbLink, title, year } = req.query;

      if (!imdbLink) {
        res.status(400).json({ error: 'IMDB link is required' });
        return;
      }

      const result = await movieService.getMovieThumbnail(imdbLink as string, title as string | undefined, year as string | undefined);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get movie backdrop
  getMovieBackdrop: async (req: Request, res: Response): Promise<void> => {
    try {
      const tmdbId = req.params.tmdbId as string;

      if (!tmdbId) {
        res.status(400).json({ error: 'TMDB ID is required' });
        return;
      }

      const result = await movieService.getMovieBackdrop(parseInt(tmdbId, 10));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get detailed movie information
  getMovieDetails: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      if (!id || isNaN(parseInt(id))) {
        res.status(400).json({ error: 'Valid movie ID is required' });
        return;
      }

      const movieDetails = await movieService.getMovieDetails(parseInt(id, 10));
      res.json(movieDetails);
    } catch (error) {
      if ((error as Error).message === 'Movie not found') {
        res.status(404).json({ error: (error as Error).message });
        return;
      }
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get autocomplete suggestions
  getAutocompleteSuggestions: async (req: Request, res: Response): Promise<void> => {
    try {
      const { field, query } = req.query;

      if (!field) {
        res.status(400).json({ error: 'Field is required' });
        return;
      }

      const suggestions = await movieService.getAutocompleteSuggestions(field as string, (query as string) || '');
      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get available formats
  getFormats: async (req: Request, res: Response): Promise<void> => {
    try {
      const formats = await movieService.getFormats();
      res.json(formats);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  getTMDBGenres: async (req: Request, res: Response): Promise<void> => {
    try {
      const genres = await tmdbService.getGenres();
      res.json(genres);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  getMovieDetailsTMDB: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const movieDetails = await tmdbService.getMovieDetails(id);
      res.json(movieDetails);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  getTVShowDetailsTMDB: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const tvShowDetails = await tmdbService.getTVShowDetails(id);
      res.json(tvShowDetails);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  searchOMDB: async (req: Request, res: Response): Promise<void> => {
    try {
      const { t: title, y: year } = req.query;
      const omdbData = await omdbService.searchMovie(title as string, year ? parseInt(year as string, 10) : null);
      res.json(omdbData);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  deleteMovie: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      await movieService.deleteMovie(id);
      res.json({ message: 'Movie deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get cast for a movie
  getMovieCast: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const cast = await MovieCast.findByMovieId(id);
      res.json(cast);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get crew for a movie
  getMovieCrew: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const crew = await MovieCrew.findByMovieId(id);
      res.json(crew);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Add movie using simplified approach - only basic fields editable
  addMovieWithPipeline: async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, year, format, price, acquired_date, comments, never_seen } = req.body;

      if (!title) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      // Search TMDB for movies and TV shows
      const tmdbResults = await tmdbService.searchAll(title, year);

      if (!tmdbResults || tmdbResults.length === 0) {
        res.status(404).json({ error: 'No movies or TV shows found in TMDB' });
        return;
      }

      // Use the first result (most relevant)
      const tmdbMovie = tmdbResults[0];

      // Get detailed TMDB data based on media type
      const tmdbDetails = tmdbMovie.media_type === 'tv'
        ? await tmdbService.getTVShowDetails(tmdbMovie.id)
        : await tmdbService.getMovieDetails(tmdbMovie.id);

      if (!tmdbDetails) {
        res.status(404).json({ error: 'Failed to get detailed information from TMDB' });
        return;
      }

      // Download images
      const posterPath = await imageService.downloadPoster(tmdbDetails.poster_path ?? null, tmdbDetails.id);
      const backdropPath = await imageService.downloadBackdrop(tmdbDetails.backdrop_path ?? null, tmdbDetails.id);

      // Extract trailer information
      const trailer = tmdbDetails.videos?.results?.find((video: Record<string, unknown>) =>
        video.type === 'Trailer' &&
        video.site === 'YouTube'
      );

      // Fetch IMDB and Rotten Tomatoes ratings from OMDB
      let imdbRating: number | null = null;
      let rottenTomatoRating: string | null = null;
      if (tmdbDetails.imdb_id) {
        try {
          const omdbData = await omdbService.getMovieByImdbId(tmdbDetails.imdb_id);
          imdbRating = omdbData?.imdbRating || null;
          rottenTomatoRating = omdbData?.rottenTomatoRating || null;
        } catch (error) {
          console.warn('Failed to fetch ratings from OMDB:', (error as Error).message);
        }
      }

      // Create movie data with all enriched information
      const movieData: Record<string, unknown> = {
        title: tmdbMovie.title,
        format: format || 'Blu-ray',
        price: price ? parseFloat(price) : null,
        acquired_date: acquired_date || new Date().toISOString().split('T')[0],
        comments: comments || '',
        never_seen: never_seen || false,
        original_title: tmdbDetails.original_title || '',
        original_language: tmdbDetails.original_language || '',
        release_date: tmdbMovie.release_date || '',
        genre: tmdbDetails.genres ? tmdbDetails.genres.map((g: Record<string, unknown>) => g.name).join(', ') : '',
        director: tmdbDetails.credits?.crew?.find((person: Record<string, unknown>) => person.job === 'Director')?.name || '',
        cast: tmdbDetails.credits?.cast?.map((actor: Record<string, unknown>) => actor.name) || [],
        plot: tmdbDetails.overview || '',
        imdb_rating: imdbRating || tmdbDetails.vote_average || null,
        rotten_tomato_rating: rottenTomatoRating,
        rotten_tomatoes_link: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(tmdbMovie.title)}`,
        imdb_id: tmdbDetails.imdb_id || '',
        tmdb_id: tmdbMovie.id,
        tmdb_rating: tmdbDetails.vote_average || null,
        runtime: tmdbDetails.runtime || null,
        poster_path: posterPath,
        backdrop_path: backdropPath,
        budget: tmdbDetails.budget || null,
        revenue: tmdbDetails.revenue || null,
        trailer_key: trailer?.key || null,
        trailer_site: trailer?.site || null,
        status: tmdbDetails.status || '',
        popularity: tmdbDetails.popularity || null,
        vote_count: tmdbDetails.vote_count || null,
        adult: tmdbDetails.adult || false,
        video: tmdbDetails.video || false,
        media_type: tmdbMovie.media_type || 'movie',
        import_id: 'manual-add',
        title_status: req.body.title_status || 'owned'
      };

      // Create movie in database
      const createdMovie = await Movie.create(movieData as unknown as MovieData);

      // Process cast and crew
      await importService.processCastAndCrew(createdMovie.id, tmdbDetails.credits as unknown as Parameters<typeof importService.processCastAndCrew>[1], tmdbDetails.id);

      const result = createdMovie;

      res.json(result);
    } catch (error) {
      console.error('Error adding movie with pipeline:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // New simplified add movie endpoint
  addMovie: async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, year, format, price, acquired_date, comments, never_seen, tmdb_id, tmdb_data, poster_path: customPosterPath } = req.body;

      if (!title) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      let tmdbMovie: Record<string, unknown>;

      // If tmdb_id and tmdb_data are provided, use the pre-selected movie
      if (tmdb_id && tmdb_data) {
        logger.debug('Using pre-selected movie:', tmdb_data.title, 'ID:', tmdb_id);
        tmdbMovie = tmdb_data;
      } else {
        // Fallback: Search TMDB for movies and TV shows
        logger.debug('Searching TMDB for:', title, year);
        const tmdbResults = await tmdbService.searchAll(title, year);

        if (!tmdbResults || tmdbResults.length === 0) {
          res.status(404).json({ error: 'No movies or TV shows found in TMDB' });
          return;
        }

        // Use the first result (most relevant)
        tmdbMovie = tmdbResults[0] as unknown as Record<string, unknown>;
        logger.debug('Selected first result:', tmdbMovie.title, 'ID:', tmdbMovie.id);
      }

      // Get detailed TMDB data based on media type
      const tmdbDetails = tmdbMovie.media_type === 'tv'
        ? await tmdbService.getTVShowDetails(tmdbMovie.id as number)
        : await tmdbService.getMovieDetails(tmdbMovie.id as number);

      if (!tmdbDetails) {
        res.status(404).json({ error: 'Failed to get detailed information from TMDB' });
        return;
      }

      // Download images - use custom poster if provided, otherwise download from TMDB
      let posterPath: string | null;
      if (customPosterPath) {
        // Custom poster selected - extract the TMDB path from the full URL
        const tmdbPath = '/' + customPosterPath.split('/').pop(); // Add leading slash
        posterPath = await imageService.downloadPoster(tmdbPath, tmdbDetails.id);
      } else {
        posterPath = await imageService.downloadPoster(tmdbDetails.poster_path ?? null, tmdbDetails.id);
      }
      const backdropPath = await imageService.downloadBackdrop(tmdbDetails.backdrop_path ?? null, tmdbDetails.id);

      // Extract trailer information
      const trailer = tmdbDetails.videos?.results?.find((video: Record<string, unknown>) =>
        video.type === 'Trailer' &&
        video.site === 'YouTube'
      );

      // Fetch IMDB and Rotten Tomatoes ratings from OMDB
      let imdbRating: number | null = null;
      let rottenTomatoRating: string | null = null;
      if (tmdbDetails.imdb_id) {
        try {
          const omdbData = await omdbService.getMovieByImdbId(tmdbDetails.imdb_id);
          imdbRating = omdbData?.imdbRating || null;
          rottenTomatoRating = omdbData?.rottenTomatoRating || null;
        } catch (error) {
          console.warn('Failed to fetch ratings from OMDB:', (error as Error).message);
        }
      }

      // Create movie data with all enriched information
      const movieData: Record<string, unknown> = {
        title: title || tmdbMovie.title,
        format: format || 'Blu-ray',
        price: price ? parseFloat(price) : null,
        acquired_date: acquired_date || new Date().toISOString().split('T')[0],
        comments: comments || '',
        never_seen: never_seen || false,
        original_title: tmdbDetails.original_title || '',
        original_language: tmdbDetails.original_language || '',
        release_date: tmdbMovie.release_date || '',
        genre: tmdbDetails.genres ? tmdbDetails.genres.map((g: Record<string, unknown>) => g.name).join(', ') : '',
        director: tmdbDetails.credits?.crew?.find((person: Record<string, unknown>) => person.job === 'Director')?.name || '',
        cast: tmdbDetails.credits?.cast?.map((actor: Record<string, unknown>) => actor.name) || [],
        plot: tmdbDetails.overview || '',
        imdb_rating: imdbRating || tmdbDetails.vote_average || null,
        rotten_tomato_rating: rottenTomatoRating,
        rotten_tomatoes_link: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(tmdbMovie.title as string)}`,
        imdb_id: tmdbDetails.imdb_id || '',
        tmdb_id: tmdbMovie.id,
        tmdb_rating: tmdbDetails.vote_average || null,
        runtime: tmdbDetails.runtime || null,
        poster_path: posterPath,
        backdrop_path: backdropPath,
        budget: tmdbDetails.budget || null,
        revenue: tmdbDetails.revenue || null,
        trailer_key: trailer?.key || null,
        trailer_site: trailer?.site || null,
        status: tmdbDetails.status || '',
        popularity: tmdbDetails.popularity || null,
        vote_count: tmdbDetails.vote_count || null,
        adult: tmdbDetails.adult || false,
        video: tmdbDetails.video || false,
        media_type: tmdbMovie.media_type || 'movie',
        import_id: 'manual-add',
        title_status: req.body.title_status || 'owned'
      };

      // Check if this EXACT edition already exists (title + tmdb_id + format)
      const existingEditions = await Movie.findAllByTmdbId(tmdbMovie.id as number);
      const exactMatch = existingEditions.find(
        (ed: MovieRow) => ed.title === title && ed.format === (format || 'Blu-ray 4K')
      );

      let result: Record<string, unknown>;
      if (exactMatch && exactMatch.title_status === 'wish' && req.body.title_status === 'owned') {
        // Special case: Moving from wishlist to collection (same title + format)
        logger.debug('Moving movie from wishlist to collection:', exactMatch.id);
        const updateData: Record<string, unknown> = {
          price: price ? parseFloat(price) : exactMatch.price,
          acquired_date: acquired_date || new Date().toISOString().split('T')[0],
          comments: comments || exactMatch.comments,
          never_seen: never_seen !== undefined ? never_seen : exactMatch.never_seen,
          title_status: 'owned'
        };

        await Movie.updateFields(exactMatch.id, updateData);
        result = await Movie.findById(exactMatch.id) as unknown as Record<string, unknown>;
      } else if (exactMatch) {
        // Exact edition already exists with same status - this will trigger the unique constraint
        logger.debug('Exact edition already exists:', exactMatch.id);
        const createdMovie = await Movie.create(movieData as unknown as MovieData);
        await importService.processCastAndCrew(createdMovie.id, tmdbDetails.credits as unknown as Parameters<typeof importService.processCastAndCrew>[1], tmdbDetails.id);
        result = createdMovie as unknown as Record<string, unknown>;
      } else {
        // Try to fetch recommended age before creating the movie
        if (movieData.tmdb_id || movieData.imdb_id) {
          try {
            logger.debug('Fetching recommended age for:', movieData.title);
            // ageRecommendationService imported at top level
            const recommendedAge = movieData.media_type === 'tv'
              ? await ageRecommendationService.getRecommendedAgeForTV(movieData.tmdb_id as number | null, movieData.imdb_id as string | null)
              : await ageRecommendationService.getRecommendedAge(movieData.tmdb_id as number | null, movieData.imdb_id as string | null);

            if (recommendedAge !== null) {
              movieData.recommended_age = recommendedAge;
              movieData.age_processed = true;
              logger.debug(`Found recommended age for "${movieData.title}": ${recommendedAge}`);
            } else {
              logger.debug(`No recommended age found for "${movieData.title}"`);
            }
          } catch (ageError) {
            logger.warn('Failed to fetch recommended age for:', movieData.title, (ageError as Error).message);
            // Continue without age - it can be backfilled later
          }
        }

        // Create new movie in database
        const createdMovie = await Movie.create(movieData as unknown as MovieData);

        // Process cast and crew
        await importService.processCastAndCrew(createdMovie.id, tmdbDetails.credits as unknown as Parameters<typeof importService.processCastAndCrew>[1], tmdbDetails.id);

        result = createdMovie as unknown as Record<string, unknown>;
      }

      res.json(result);
    } catch (error) {
      console.error('Error adding movie:', error);

      // Check for unique constraint violation
      if ((error as Error).message && (error as Error).message.includes('UNIQUE constraint failed')) {
        if ((error as Error).message.includes('idx_movie_edition_unique') ||
            (error as Error).message.includes('movies.title') ||
            (error as Error).message.includes('movies.tmdb_id') ||
            (error as Error).message.includes('movies.format')) {
          res.status(409).json({
            error: 'A movie with this exact title and format already exists in your collection.',
            code: 'DUPLICATE_EDITION'
          });
          return;
        }
      }

      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Search TMDB for movies (used when adding movies)
  searchTMDB: async (req: Request, res: Response): Promise<void> => {
    try {
      const { query } = req.query;

      if (!query) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }

      const results = await tmdbService.searchMovies(query as string);
      res.json(results);
    } catch (error) {
      console.error('Error searching TMDB:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Refresh movie ratings from external sources
  refreshMovieRatings: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);

      if (!id || isNaN(id)) {
        res.status(400).json({ error: 'Movie ID is required' });
        return;
      }

      const movie = await movieService.getMovieById(id);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      const updatedMovie = await movieService.refreshMovieRatings(id);
      res.json(updatedMovie);
    } catch (error) {
      console.error('Error refreshing movie ratings:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get movies by status (owned, wish, to_sell)
  getMoviesByStatus: async (req: Request, res: Response): Promise<void> => {
    try {
      const status = req.params.status as string;
      const movies = await Movie.findByStatus(status);
      const parsedMovies = movies.map((movie: MovieData) => {
        const validatedMovie = Movie.validateImagePaths(movie);
        return {
          ...validatedMovie,
          cast: Array.isArray(validatedMovie.cast) ? validatedMovie.cast : (validatedMovie.cast ? JSON.parse(validatedMovie.cast as string) : [])
        };
      });
      res.json(parsedMovies);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Update movie status
  updateMovieStatus: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { title_status } = req.body;

      if (!title_status || !['owned', 'wish', 'to_sell'].includes(title_status)) {
        res.status(400).json({ error: 'Invalid status. Must be owned, wish, or to_sell' });
        return;
      }

      const result = await Movie.updateStatus(id, title_status);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Run migration to add title_status column
  migrateTitleStatus: async (req: Request, res: Response): Promise<void> => {
    try {
      await Movie.addTitleStatusColumn();
      res.json({ message: 'Migration completed successfully' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Check if a movie exists and return its status
  checkMovieStatus: async (req: Request, res: Response): Promise<void> => {
    try {
      const { tmdb_id, title } = req.query;

      if (!tmdb_id && !title) {
        res.status(400).json({ error: 'Either tmdb_id or title is required' });
        return;
      }

      let existingMovie: MovieRow | undefined = undefined;

      if (tmdb_id) {
        try {
          existingMovie = await Movie.findByTmdbId(parseInt(tmdb_id as string, 10));
        } catch (dbError) {
          logger.error('Database error in findByTmdbId:', dbError);
          res.status(500).json({ error: 'Database error: ' + (dbError as Error).message });
          return;
        }
      }

      if (!existingMovie && title) {
        try {
          existingMovie = await Movie.findByTitle(title as string);
        } catch (dbError) {
          logger.error('Database error in findByTitle:', dbError);
          res.status(500).json({ error: 'Database error: ' + (dbError as Error).message });
          return;
        }
      }

      if (existingMovie) {
        res.json({
          exists: true,
          status: (existingMovie.title_status as string) || 'owned',
          movie: {
            id: existingMovie.id,
            title: existingMovie.title,
            title_status: (existingMovie.title_status as string) || 'owned'
          }
        });
      } else {
        res.json({
          exists: false,
          status: null,
          movie: null
        });
      }
    } catch (error) {
      logger.error('Error checking movie status:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Check all editions of a movie by TMDB ID
  checkMovieEditions: async (req: Request, res: Response): Promise<void> => {
    try {
      const { tmdb_id } = req.query;

      if (!tmdb_id) {
        res.status(400).json({ error: 'tmdb_id is required' });
        return;
      }

      try {
        const editions = await Movie.findAllByTmdbId(parseInt(tmdb_id as string, 10));

        if (editions && editions.length > 0) {
          res.json({
            exists: true,
            count: editions.length,
            editions: editions.map((ed: MovieRow) => ({
              id: ed.id,
              title: ed.title,
              format: ed.format,
              title_status: (ed.title_status as string) || 'owned',
              acquired_date: ed.acquired_date,
              price: ed.price
            }))
          });
        } else {
          res.json({
            exists: false,
            count: 0,
            editions: []
          });
        }
      } catch (dbError) {
        logger.error('Database error in findAllByTmdbId:', dbError);
        res.status(500).json({ error: 'Database error: ' + (dbError as Error).message });
      }
    } catch (error) {
      logger.error('Error checking movie editions:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Toggle watch_next status for a movie
  toggleWatchNext: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const result = await Movie.toggleWatchNext(id);
      res.json(result);
    } catch (error) {
      logger.error('Error toggling watch_next:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Mark a movie as watched (sets last_watched to today)
  markAsWatched: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { date, incrementCount = true } = req.body;

      const result = await Movie.markAsWatched(id, date, incrementCount);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Invalidate analytics cache since watch data changed
      await cacheService.invalidateAll();

      res.json(result);
    } catch (error) {
      logger.error('Error marking movie as watched:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Clear movie watched date and count (reset watch history)
  clearWatched: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);

      const result = await Movie.clearWatched(id);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Invalidate analytics cache since watch data changed
      await cacheService.invalidateAll();

      res.json(result);
    } catch (error) {
      logger.error('Error clearing movie watch history:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Update watch count directly
  updateWatchCount: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { count } = req.body;

      if (count === undefined || count === null) {
        res.status(400).json({ error: 'Count is required' });
        return;
      }

      const result = await Movie.updateWatchCount(id, count);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      res.json(result);
    } catch (error) {
      logger.error('Error updating watch count:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get available posters from TMDB
  getMoviePosters: async (req: Request, res: Response): Promise<void> => {
    try {
      const tmdbId = parseInt(req.params.tmdbId as string, 10);
      const { mediaType } = req.query;
      const posters = await tmdbService.getMoviePosters(tmdbId, mediaType as string | undefined);
      res.json(posters);
    } catch (error) {
      logger.error('Error fetching movie posters:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Upload custom poster for a movie
  uploadCustomPoster: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const file = req.file as Express.Multer.File | undefined;

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      logger.info(`Uploading custom poster for movie ${id}: ${file.filename}`);

      // Get image dimensions (try to use sharp if available, otherwise use defaults)
      let width = 500;
      let height = 750;

      try {
        // Try to load sharp dynamically
        const sharp = require('sharp');
        const metadata = await sharp(file.path).metadata();
        width = metadata.width;
        height = metadata.height;
      } catch (error) {
        // Sharp not available or error reading metadata - use defaults
        logger.debug('Using default poster dimensions (sharp not available or error)');
      }

      // Construct the poster path (relative to images directory)
      const posterPath = `/images/posters/custom/${file.filename}`;

      // Update only the poster_path field without affecting other data
      const db = require('../database').getDatabase();
      await new Promise<void>((resolve, reject) => {
        const sql = 'UPDATE movies SET poster_path = ? WHERE id = ?';
        db.run(sql, [posterPath, id], function(this: { changes: number }, err: Error | null) {
          if (err) {
            logger.error(`Failed to update poster for movie ${id}:`, err);
            reject(err);
          } else {
            logger.info(`Updated movie ${id} with custom poster: ${posterPath}`);
            resolve();
          }
        });
      });

      res.json({
        success: true,
        posterPath: posterPath,
        filename: file.filename,
        width,
        height
      });
    } catch (error) {
      logger.error('Error uploading custom poster:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Fix box set collection types based on actual movie data
  fixBoxSetTypes: async (req: Request, res: Response): Promise<void> => {
    try {
      const db = require('../database').getDatabase();

      // Get all unique box_set_name values from movies table
      const boxSetNames: string[] = await new Promise((resolve, reject) => {
        db.all(`
          SELECT DISTINCT box_set_name
          FROM movies
          WHERE box_set_name IS NOT NULL
          AND box_set_name != ''
          ORDER BY box_set_name
        `, (err: Error | null, rows: Array<{ box_set_name: string }>) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(row => row.box_set_name));
          }
        });
      });

      console.log(`Found ${boxSetNames.length} box sets in movies table:`, boxSetNames);

      // Update collections that match these box set names
      let updatedCount = 0;
      for (const boxSetName of boxSetNames) {
        const result: number = await new Promise((resolve, reject) => {
          db.run(`
            UPDATE collections
            SET type = 'box_set'
            WHERE name = ? AND type != 'box_set'
          `, [boxSetName], function(this: { changes: number }, err: Error | null) {
            if (err) {
              reject(err);
            } else {
              resolve(this.changes);
            }
          });
        });

        if (result > 0) {
          console.log(`Updated collection "${boxSetName}" to box_set type`);
          updatedCount += result;
        } else {
          console.log(`Collection "${boxSetName}" already has correct type or doesn't exist`);
        }
      }

      res.json({
        message: `Updated ${updatedCount} collections to box_set type`,
        updatedCount,
        boxSetNames
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Debug endpoint to check collection types
  debugCollections: async (req: Request, res: Response): Promise<void> => {
    try {
      const db = require('../database').getDatabase();
      const collections: Array<Record<string, unknown>> = await new Promise((resolve, reject) => {
        db.all(`
          SELECT name, type, is_system, created_at
          FROM collections
          ORDER BY name
        `, (err: Error | null, rows: Array<Record<string, unknown>>) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });

      res.json(collections);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get all unique collection names for autocomplete (only user collections)
  getCollectionNames: async (req: Request, res: Response): Promise<void> => {
    try {
      const collections = await collectionService.getAllCollections();

      // Filter to only show user collections (not system or box_set collections)
      const userCollections = collections
        .filter((c) => c.type === 'user')
        .map((c) => c.name)
        .sort();

      res.json(userCollections);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get movies by collection name
  getMoviesByCollection: async (req: Request, res: Response): Promise<void> => {
    try {
      const { collectionName } = req.query;
      if (!collectionName) {
        res.status(400).json({ error: 'Collection name is required' });
        return;
      }
      const collection = await collectionService.findByName(collectionName as string);

      if (!collection) {
        res.status(404).json({ error: 'Collection not found' });
        return;
      }

      const result = await collectionService.getCollectionMovies(collection.id);
      const movies = result.movies;

      // Parse cast field and validate image paths
      const parsedMovies = movies.map((movie) => {
        const validatedMovie = Movie.validateImagePaths(movie as unknown as MovieData);
        return {
          ...validatedMovie,
          cast: Array.isArray(validatedMovie.cast) ? validatedMovie.cast : (validatedMovie.cast ? JSON.parse(validatedMovie.cast as string) : [])
        };
      });

      res.json(parsedMovies);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // ===== COLLECTION ENDPOINTS =====

  // Get Watch Next movies
  getWatchNextMovies: async (req: Request, res: Response): Promise<void> => {
    try {
      const movies = await collectionService.getWatchNextMovies();
      res.json(movies);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get all collections
  getAllCollections: async (req: Request, res: Response): Promise<void> => {
    try {
      const collections = await collectionService.getAllCollections();
      res.json(collections);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get collection suggestions for typeahead
  getCollectionSuggestions: async (req: Request, res: Response): Promise<void> => {
    try {
      const { q = '' } = req.query;
      const suggestions = await collectionService.getSuggestions(q as string);
      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Create a new collection
  createCollection: async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Collection name is required' });
        return;
      }

      const collection = await collectionService.createCollection(name.trim());
      res.status(201).json(collection);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Update collection name
  updateCollection: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { name } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Collection name is required' });
        return;
      }

      const result = await collectionService.updateCollection(id, name.trim());
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Delete collection
  deleteCollection: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const result = await collectionService.deleteCollection(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get movies in a collection
  getCollectionMovies: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const result = await collectionService.getCollectionMovies(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Add movie to collection
  addMovieToCollection: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { collectionName, collectionType = 'user' } = req.body;

      if (!collectionName || !collectionName.trim()) {
        res.status(400).json({ error: 'Collection name is required' });
        return;
      }

      const result = await collectionService.addMovieToCollection(id, collectionName.trim(), collectionType);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Remove movie from collection
  removeMovieFromCollection: async (req: Request, res: Response): Promise<void> => {
    try {
      const movieId = parseInt(req.params.movieId as string, 10);
      const collectionId = parseInt(req.params.collectionId as string, 10);
      const result = await collectionService.removeMovieFromCollection(movieId, collectionId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Update movie's collections (replaces all collections)
  updateMovieCollections: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { collectionNames = [] } = req.body;

      const result = await collectionService.updateMovieCollections(id, collectionNames);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get movie's collections
  getMovieCollections: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const collections = await collectionService.getMovieCollections(id);
      res.json(collections);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Handle collection name change (rename vs create new)
  handleCollectionNameChange: async (req: Request, res: Response): Promise<void> => {
    try {
      const { oldName, newName, action } = req.body;

      if (!oldName || !newName || !action) {
        res.status(400).json({ error: 'oldName, newName, and action are required' });
        return;
      }

      if (!['rename', 'create'].includes(action)) {
        res.status(400).json({ error: 'action must be "rename" or "create"' });
        return;
      }

      const result = await collectionService.handleCollectionNameChange(oldName, newName, action);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Update movie order in collection
  updateMovieOrder: async (req: Request, res: Response): Promise<void> => {
    try {
      const movieId = parseInt(req.params.movieId as string, 10);
      const collectionId = parseInt(req.params.collectionId as string, 10);
      const { order } = req.body;

      if (order === undefined || order === null) {
        res.status(400).json({ error: 'Order is required' });
        return;
      }

      const result = await collectionService.updateMovieOrder(movieId, collectionId, order);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Clean up empty collections
  cleanupEmptyCollections: async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await collectionService.cleanupEmptyCollections();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Scan a cover image to identify a movie using local LLM
  scanCover: async (req: Request, res: Response): Promise<void> => {
    try {
      const { image, mimeType } = req.body;

      if (!image) {
        res.status(400).json({ error: 'Image data is required' });
        return;
      }

      // Check LLM availability first
      const health = await coverScanService.checkHealth();
      if (!health.available) {
        res.status(503).json({ error: 'Cover scan service is not available', details: health.error });
        return;
      }

      // Analyze the cover image
      let llmResult: Record<string, unknown>;
      try {
        llmResult = await coverScanService.analyzeImage(image, mimeType || 'image/jpeg', 'movie') as unknown as Record<string, unknown>;
      } catch (error) {
        logger.error('LLM analysis failed:', (error as Error).message);
        res.status(422).json({ error: 'Could not identify movie from cover image', details: (error as Error).message });
        return;
      }

      // Search TMDB with extracted title (and original title if different)
      const searches: Array<Promise<Array<Record<string, unknown>>>> = [
        tmdbService.searchAll(llmResult.title as string, llmResult.year as string | undefined) as unknown as Promise<Array<Record<string, unknown>>>,
        tmdbService.searchAll(llmResult.title as string) as unknown as Promise<Array<Record<string, unknown>>>
      ];
      if (llmResult.original_title) {
        searches.push(tmdbService.searchAll(llmResult.original_title as string, llmResult.year as string | undefined) as unknown as Promise<Array<Record<string, unknown>>>);
        searches.push(tmdbService.searchAll(llmResult.original_title as string) as unknown as Promise<Array<Record<string, unknown>>>);
      }
      const searchResults = await Promise.all(searches);

      // Merge and deduplicate by TMDB id
      const seen = new Set<number>();
      const tmdbResults: Array<Record<string, unknown>> = [];
      for (const results of searchResults) {
        for (const r of results) {
          if (!seen.has(r.id as number)) {
            seen.add(r.id as number);
            tmdbResults.push(r);
          }
        }
      }

      if (!tmdbResults || tmdbResults.length === 0) {
        res.json({
          llm_result: llmResult,
          suggested_format: llmResult.format,
          results: [],
          best_match_index: null
        });
        return;
      }

      // Rank results by match quality
      const rankedResults = coverScanService.rankResults(tmdbResults as unknown as Parameters<typeof coverScanService.rankResults>[0], llmResult as unknown as Parameters<typeof coverScanService.rankResults>[1]);

      // Determine confidence before stripping scores
      const confidence = coverScanService.getConfidence(rankedResults);

      // Check existing editions for top results (same pattern as searchAllTMDB)
      const resultsWithEditions = await Promise.all(
        rankedResults.slice(0, 10).map(async (movie) => {
          // Strip internal _score before sending to client
          const { _score, ...movieData } = movie;
          try {
            const editions = await Movie.findAllByTmdbId(movieData.id as number);
            return {
              ...movieData,
              existingEditions: editions ? editions.map((ed: MovieRow) => ({
                id: ed.id,
                title: ed.title,
                format: ed.format,
                title_status: (ed.title_status as string) || 'owned'
              })) : [],
              hasEditions: editions && editions.length > 0,
              editionsCount: editions ? editions.length : 0
            };
          } catch (err) {
            return { ...movieData, existingEditions: [] as Array<{ id: number; title: string | null; format: string | null; title_status: string }>, hasEditions: false, editionsCount: 0 };
          }
        })
      );

      // Poster matching: try to find which TMDB poster matches the scanned cover
      let matchedPoster: string | null = null;
      try {
        const bestMatch = resultsWithEditions[0];
        if (bestMatch) {
          const posters = await tmdbService.getMoviePosters((bestMatch as unknown as Record<string, unknown>).id as number, (bestMatch as unknown as Record<string, unknown>).media_type as string | undefined);
          if (posters && posters.length > 1) {
            matchedPoster = await coverScanService.matchPoster(image, posters as unknown as Parameters<typeof coverScanService.matchPoster>[1]);
          }
        }
      } catch (e) {
        logger.debug('Poster matching failed (non-fatal):', (e as Error).message);
      }

      res.json({
        llm_result: llmResult,
        suggested_format: llmResult.format,
        confidence,
        results: resultsWithEditions,
        best_match_index: 0,
        matched_poster: matchedPoster
      });
    } catch (error) {
      logger.error('Error scanning cover:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  posterUploadMiddleware: posterUpload.single('poster')
};

export default movieController;
