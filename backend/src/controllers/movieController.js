const multer = require('multer');
const path = require('path');
const fs = require('fs');
const movieService = require('../services/movieService');
const tmdbService = require('../services/tmdbService');
const omdbService = require('../services/omdbService');
const importService = require('../services/importService');
const imageService = require('../services/imageService');
const collectionService = require('../services/collectionService');
const Movie = require('../models/movie');
const MovieCast = require('../models/movieCast');
const MovieCrew = require('../models/movieCrew');
const logger = require('../logger');

// Configure multer for poster uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const customPosterDir = path.join(imageService.getLocalImagesDir(), 'posters', 'custom');
    // Ensure directory exists
    if (!fs.existsSync(customPosterDir)) {
      fs.mkdirSync(customPosterDir, { recursive: true });
    }
    cb(null, customPosterDir);
  },
  filename: (req, file, cb) => {
    const movieId = req.params.id;
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
  fileFilter: (req, file, cb) => {
    // Accept images only
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
  }
});

const movieController = {
  getAllMovies: async (req, res) => {
    try {
      // Only return owned movies by default (for collection view)
      const movies = await Movie.findByStatus('owned');
      // Parse cast field from JSON string back to array and validate image paths
      const parsedMovies = movies.map(movie => {
        const validatedMovie = Movie.validateImagePaths(movie);
        return {
          ...validatedMovie,
          cast: Array.isArray(validatedMovie.cast) ? validatedMovie.cast : (validatedMovie.cast ? JSON.parse(validatedMovie.cast) : [])
        };
      });
      res.json(parsedMovies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  searchMovies: async (req, res) => {
    try {
      const criteria = req.query;
      const movies = await movieService.searchMovies(criteria);
      // Parse cast field from JSON string back to array and validate image paths
      const parsedMovies = movies.map(movie => {
        const validatedMovie = Movie.validateImagePaths(movie);
        return {
          ...validatedMovie,
          cast: Array.isArray(validatedMovie.cast) ? validatedMovie.cast : (validatedMovie.cast ? JSON.parse(validatedMovie.cast) : [])
        };
      });
      res.json(parsedMovies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Search movies using TMDB API for adding new movies
  searchMoviesTMDB: async (req, res) => {
    try {
      const { query, year } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      const movies = await tmdbService.searchMovies(query, year);
      res.json(movies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // New combined search for movies and TV shows
  searchAllTMDB: async (req, res) => {
    try {
      const { query, year } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      const results = await tmdbService.searchAll(query, year);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },




  // Fetch ratings for a movie
  fetchRatings: async (req, res) => {
    try {
      const { title, year } = req.query;
      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }
      
      const ratings = await movieService.fetchMovieRatings(title, year);
      res.json(ratings);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Create a new movie
  createMovie: async (req, res) => {
    try {
      const movieData = req.body;
      
      // Validate required fields
      if (!movieData.title) {
        return res.status(400).json({ error: 'Title is required' });
      }
      
      const result = await movieService.createMovieWithRatings(movieData);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Update an existing movie
  updateMovie: async (req, res) => {
    try {
      const { id } = req.params;
      const movieData = req.body;
      
      const result = await movieService.updateMovie(id, movieData);
      if (!result) {
        return res.status(404).json({ error: 'Movie not found' });
      }
      
      res.json(result);
    } catch (error) {
      // Check for unique constraint violation
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        // Extract which constraint failed
        if (error.message.includes('idx_movie_edition_unique') || 
            error.message.includes('movies.title') || 
            error.message.includes('movies.tmdb_id') || 
            error.message.includes('movies.format')) {
          return res.status(409).json({ 
            error: 'A movie with this title, TMDB ID, and format already exists in your collection. Please use a different title or format to distinguish this edition.',
            code: 'DUPLICATE_EDITION'
          });
        }
      }
      
      logger.error('Error updating movie:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get a single movie by ID
  getMovieById: async (req, res) => {
    try {
      const { id } = req.params;
      const movie = await movieService.getMovieById(id);
      
      if (!movie) {
        return res.status(404).json({ error: 'Movie not found' });
      }
      
      res.json(movie);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Export movies as CSV
  exportCSV: async (req, res) => {
    try {
      const movies = await movieService.getAllMovies();
      
      // Convert to CSV format
      const csvHeader = 'Title,Genre,Director,Cast,Year,Format,IMDB Rating,Rotten Tomato Rating,Plot,Acquired Date\n';
      const csvRows = movies.map(movie => {
        const cast = Array.isArray(movie.cast) ? movie.cast.join('; ') : movie.cast;
        return `"${movie.title}","${movie.genre}","${movie.director}","${cast}","${movie.year}","${movie.format}","${movie.imdb_rating || ''}","${movie.rotten_tomato_rating || ''}","${movie.plot}","${movie.acquired_date}"`;
      }).join('\n');
      
      const csvContent = csvHeader + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="movies.csv"');
      res.send(csvContent);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },



  // Get movie thumbnail
  getMovieThumbnail: async (req, res) => {
    try {
      const { imdbLink, title, year } = req.query;
      
      if (!imdbLink) {
        return res.status(400).json({ error: 'IMDB link is required' });
      }

      const result = await movieService.getMovieThumbnail(imdbLink, title, year);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get movie backdrop
  getMovieBackdrop: async (req, res) => {
    try {
      const { tmdbId } = req.params;
      
      if (!tmdbId) {
        return res.status(400).json({ error: 'TMDB ID is required' });
      }

      const result = await movieService.getMovieBackdrop(tmdbId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get detailed movie information
  getMovieDetails: async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'Valid movie ID is required' });
      }

      const movieDetails = await movieService.getMovieDetails(parseInt(id));
      res.json(movieDetails);
    } catch (error) {
      if (error.message === 'Movie not found') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  },

  // Get autocomplete suggestions
  getAutocompleteSuggestions: async (req, res) => {
    try {
      const { field, query } = req.query;
      
      if (!field) {
        return res.status(400).json({ error: 'Field is required' });
      }

      const suggestions = await movieService.getAutocompleteSuggestions(field, query || '');
      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get available formats
  getFormats: async (req, res) => {
    try {
      const formats = await movieService.getFormats();
      res.json(formats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getTMDBGenres: async (req, res) => {
    try {
      const genres = await tmdbService.getGenres();
      res.json(genres);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getMovieDetailsTMDB: async (req, res) => {
    try {
      const { id } = req.params;
      const movieDetails = await tmdbService.getMovieDetails(id);
      res.json(movieDetails);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getTVShowDetailsTMDB: async (req, res) => {
    try {
      const { id } = req.params;
      const tvShowDetails = await tmdbService.getTVShowDetails(id);
      res.json(tvShowDetails);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  searchOMDB: async (req, res) => {
    try {
      const { t: title, y: year } = req.query;
      const omdbData = await omdbService.searchMovie(title, year);
      res.json(omdbData);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  deleteMovie: async (req, res) => {
    try {
      const { id } = req.params;
      await movieService.deleteMovie(id);
      res.json({ message: 'Movie deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get cast for a movie
  getMovieCast: async (req, res) => {
    try {
      const { id } = req.params;
      const cast = await MovieCast.findByMovieId(id);
      res.json(cast);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get crew for a movie
  getMovieCrew: async (req, res) => {
    try {
      const { id } = req.params;
      const crew = await MovieCrew.findByMovieId(id);
      res.json(crew);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Add movie using simplified approach - only basic fields editable
  addMovieWithPipeline: async (req, res) => {
    try {
      const { title, year, format, price, acquired_date, comments, never_seen } = req.body;
      
      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      // Search TMDB for movies and TV shows
      const tmdbResults = await tmdbService.searchAll(title, year);
      
      if (!tmdbResults || tmdbResults.length === 0) {
        return res.status(404).json({ error: 'No movies or TV shows found in TMDB' });
      }

      // Use the first result (most relevant)
      const tmdbMovie = tmdbResults[0];
      
      // Get detailed TMDB data based on media type
      const tmdbDetails = tmdbMovie.media_type === 'tv' 
        ? await tmdbService.getTVShowDetails(tmdbMovie.id)
        : await tmdbService.getMovieDetails(tmdbMovie.id);
      
      if (!tmdbDetails) {
        return res.status(404).json({ error: 'Failed to get detailed information from TMDB' });
      }

      // Download images
      const posterPath = await imageService.downloadPoster(tmdbDetails.poster_path, tmdbDetails.id);
      const backdropPath = await imageService.downloadBackdrop(tmdbDetails.backdrop_path, tmdbDetails.id);
      
      // Extract trailer information
      const trailer = tmdbDetails.videos?.results?.find(video => 
        video.type === 'Trailer' && 
        video.site === 'YouTube'
      );

      // Fetch IMDB and Rotten Tomatoes ratings from OMDB
      let imdbRating = null;
      let rottenTomatoRating = null;
      if (tmdbDetails.imdb_id) {
        try {
          const omdbData = await omdbService.getMovieByImdbId(tmdbDetails.imdb_id);
          imdbRating = omdbData?.imdbRating || null;
          rottenTomatoRating = omdbData?.rottenTomatoRating || null;
        } catch (error) {
          console.warn('Failed to fetch ratings from OMDB:', error.message);
        }
      }

      // Create movie data with all enriched information
      const movieData = {
        // User-editable fields
        title: tmdbMovie.title,
        format: format || 'Blu-ray',
        price: price ? parseFloat(price) : null,
        acquired_date: acquired_date || new Date().toISOString().split('T')[0],
        comments: comments || '',
        never_seen: never_seen || false,
        
        // All other data comes from TMDB
        original_title: tmdbDetails.original_title || '',
        original_language: tmdbDetails.original_language || '',
        release_date: tmdbMovie.release_date || '',
        genre: tmdbDetails.genres ? tmdbDetails.genres.map(g => g.name).join(', ') : '',
        director: tmdbDetails.credits?.crew?.find(person => person.job === 'Director')?.name || '',
        cast: tmdbDetails.credits?.cast?.map(actor => actor.name) || [],
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
      const createdMovie = await Movie.create(movieData);
      
      // Process cast and crew
      await importService.processCastAndCrew(createdMovie.id, tmdbDetails.credits, tmdbDetails.id);
      
      const result = createdMovie;

      res.json(result);
    } catch (error) {
      console.error('Error adding movie with pipeline:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // New simplified add movie endpoint
  addMovie: async (req, res) => {
    try {
      const { title, year, format, price, acquired_date, comments, never_seen, tmdb_id, tmdb_data, poster_path: customPosterPath } = req.body;
      
      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      let tmdbMovie;
      
      // If tmdb_id and tmdb_data are provided, use the pre-selected movie
      if (tmdb_id && tmdb_data) {
        logger.debug('Using pre-selected movie:', tmdb_data.title, 'ID:', tmdb_id);
        tmdbMovie = tmdb_data;
      } else {
        // Fallback: Search TMDB for movies and TV shows
        logger.debug('Searching TMDB for:', title, year);
        const tmdbResults = await tmdbService.searchAll(title, year);
        
        if (!tmdbResults || tmdbResults.length === 0) {
          return res.status(404).json({ error: 'No movies or TV shows found in TMDB' });
        }

        // Use the first result (most relevant)
        tmdbMovie = tmdbResults[0];
        logger.debug('Selected first result:', tmdbMovie.title, 'ID:', tmdbMovie.id);
      }
      
      // Get detailed TMDB data based on media type
      const tmdbDetails = tmdbMovie.media_type === 'tv' 
        ? await tmdbService.getTVShowDetails(tmdbMovie.id)
        : await tmdbService.getMovieDetails(tmdbMovie.id);
      
      if (!tmdbDetails) {
        return res.status(404).json({ error: 'Failed to get detailed information from TMDB' });
      }

      // Download images - use custom poster if provided, otherwise download from TMDB
      let posterPath;
      if (customPosterPath) {
        // Custom poster selected - extract the TMDB path from the full URL
        // URL format: https://image.tmdb.org/t/p/original/filename.jpg
        // We need: /filename.jpg
        const tmdbPath = '/' + customPosterPath.split('/').pop(); // Add leading slash
        posterPath = await imageService.downloadPoster(tmdbPath, tmdbDetails.id);
      } else {
        // Use default TMDB poster
        posterPath = await imageService.downloadPoster(tmdbDetails.poster_path, tmdbDetails.id);
      }
      const backdropPath = await imageService.downloadBackdrop(tmdbDetails.backdrop_path, tmdbDetails.id);
      
      // Extract trailer information
      const trailer = tmdbDetails.videos?.results?.find(video => 
        video.type === 'Trailer' && 
        video.site === 'YouTube'
      );

      // Fetch IMDB and Rotten Tomatoes ratings from OMDB
      let imdbRating = null;
      let rottenTomatoRating = null;
      if (tmdbDetails.imdb_id) {
        try {
          const omdbData = await omdbService.getMovieByImdbId(tmdbDetails.imdb_id);
          imdbRating = omdbData?.imdbRating || null;
          rottenTomatoRating = omdbData?.rottenTomatoRating || null;
        } catch (error) {
          console.warn('Failed to fetch ratings from OMDB:', error.message);
        }
      }

      // Create movie data with all enriched information
      const movieData = {
        // User-editable fields
        title: title || tmdbMovie.title, // Use the custom title from the form
        format: format || 'Blu-ray',
        price: price ? parseFloat(price) : null,
        acquired_date: acquired_date || new Date().toISOString().split('T')[0],
        comments: comments || '',
        never_seen: never_seen || false,
        
        // All other data comes from TMDB
        original_title: tmdbDetails.original_title || '',
        original_language: tmdbDetails.original_language || '',
        release_date: tmdbMovie.release_date || '',
        genre: tmdbDetails.genres ? tmdbDetails.genres.map(g => g.name).join(', ') : '',
        director: tmdbDetails.credits?.crew?.find(person => person.job === 'Director')?.name || '',
        cast: tmdbDetails.credits?.cast?.map(actor => actor.name) || [],
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

      // Check if this EXACT edition already exists (title + tmdb_id + format)
      // This supports multiple editions of the same movie
      const existingEditions = await Movie.findAllByTmdbId(tmdbMovie.id);
      const exactMatch = existingEditions.find(
        ed => ed.title === title && ed.format === (format || 'Blu-ray 4K')
      );
      
      let result;
      if (exactMatch && exactMatch.title_status === 'wish' && req.body.title_status === 'owned') {
        // Special case: Moving from wishlist to collection (same title + format)
        logger.debug('Moving movie from wishlist to collection:', exactMatch.id);
        const updateData = {
          price: price ? parseFloat(price) : exactMatch.price,
          acquired_date: acquired_date || new Date().toISOString().split('T')[0],
          comments: comments || exactMatch.comments,
          never_seen: never_seen !== undefined ? never_seen : exactMatch.never_seen,
          title_status: 'owned'
        };
        
        await Movie.updateFields(exactMatch.id, updateData);
        result = await Movie.findById(exactMatch.id);
      } else if (exactMatch) {
        // Exact edition already exists with same status - this will trigger the unique constraint
        // Let it fall through to the create, which will throw the proper error
        logger.debug('Exact edition already exists:', exactMatch.id);
        const createdMovie = await Movie.create(movieData);
        await importService.processCastAndCrew(createdMovie.id, tmdbDetails.credits, tmdbDetails.id);
        result = createdMovie;
      } else {
        // Try to fetch recommended age before creating the movie
        if (movieData.tmdb_id || movieData.imdb_id) {
          try {
            logger.debug('Fetching recommended age for:', movieData.title);
            const ageRecommendationService = require('../services/ageRecommendationService');
            const recommendedAge = movieData.media_type === 'tv' 
              ? await ageRecommendationService.getRecommendedAgeForTV(movieData.tmdb_id, movieData.imdb_id)
              : await ageRecommendationService.getRecommendedAge(movieData.tmdb_id, movieData.imdb_id);
            
            if (recommendedAge !== null) {
              movieData.recommended_age = recommendedAge;
              movieData.age_processed = true;
              logger.debug(`Found recommended age for "${movieData.title}": ${recommendedAge}`);
            } else {
              logger.debug(`No recommended age found for "${movieData.title}"`);
            }
          } catch (ageError) {
            logger.warn('Failed to fetch recommended age for:', movieData.title, ageError.message);
            // Continue without age - it can be backfilled later
          }
        }

        // Create new movie in database
        const createdMovie = await Movie.create(movieData);
        
        // Process cast and crew
        await importService.processCastAndCrew(createdMovie.id, tmdbDetails.credits, tmdbDetails.id);
        
        result = createdMovie;
      }

      res.json(result);
    } catch (error) {
      console.error('Error adding movie:', error);
      
      // Check for unique constraint violation
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        if (error.message.includes('idx_movie_edition_unique') || 
            error.message.includes('movies.title') || 
            error.message.includes('movies.tmdb_id') || 
            error.message.includes('movies.format')) {
          return res.status(409).json({ 
            error: 'A movie with this exact title and format already exists in your collection.',
            code: 'DUPLICATE_EDITION'
          });
        }
      }
      
      res.status(500).json({ error: error.message });
    }
  },


  // Search TMDB for movies (used when adding movies)
  searchTMDB: async (req, res) => {
    try {
      const { query } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      const results = await tmdbService.searchMovies(query);
      res.json(results);
    } catch (error) {
      console.error('Error searching TMDB:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Refresh movie ratings from external sources
  refreshMovieRatings: async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Movie ID is required' });
      }

      // Get the current movie data
      const movie = await movieService.getMovieById(id);
      if (!movie) {
        return res.status(404).json({ error: 'Movie not found' });
      }

      // Refresh ratings from external sources
      const updatedMovie = await movieService.refreshMovieRatings(id);
      
      res.json(updatedMovie);
    } catch (error) {
      console.error('Error refreshing movie ratings:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get movies by status (owned, wish, to_sell)
  getMoviesByStatus: async (req, res) => {
    try {
      const { status } = req.params;
      const movies = await Movie.findByStatus(status);
      // Parse cast field from JSON string back to array and validate image paths
      const parsedMovies = movies.map(movie => {
        const validatedMovie = Movie.validateImagePaths(movie);
        return {
          ...validatedMovie,
          cast: Array.isArray(validatedMovie.cast) ? validatedMovie.cast : (validatedMovie.cast ? JSON.parse(validatedMovie.cast) : [])
        };
      });
      res.json(parsedMovies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Update movie status
  updateMovieStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { title_status } = req.body;
      
      if (!title_status || !['owned', 'wish', 'to_sell'].includes(title_status)) {
        return res.status(400).json({ error: 'Invalid status. Must be owned, wish, or to_sell' });
      }

      const result = await Movie.updateStatus(id, title_status);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Run migration to add title_status column
  migrateTitleStatus: async (req, res) => {
    try {
      await Movie.addTitleStatusColumn();
      res.json({ message: 'Migration completed successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Check if a movie exists and return its status
  checkMovieStatus: async (req, res) => {
    try {
      const { tmdb_id, title } = req.query;
      
      if (!tmdb_id && !title) {
        return res.status(400).json({ error: 'Either tmdb_id or title is required' });
      }

      let existingMovie = null;
      
      // First check by TMDB ID if provided
      if (tmdb_id) {
        try {
          existingMovie = await Movie.findByTmdbId(tmdb_id);
        } catch (dbError) {
          logger.error('Database error in findByTmdbId:', dbError);
          return res.status(500).json({ error: 'Database error: ' + dbError.message });
        }
      }
      
      // If not found by TMDB ID and title is provided, check by title
      if (!existingMovie && title) {
        try {
          existingMovie = await Movie.findByTitle(title);
        } catch (dbError) {
          logger.error('Database error in findByTitle:', dbError);
          return res.status(500).json({ error: 'Database error: ' + dbError.message });
        }
      }

      if (existingMovie) {
        res.json({
          exists: true,
          status: existingMovie.title_status || 'owned',
          movie: {
            id: existingMovie.id,
            title: existingMovie.title,
            title_status: existingMovie.title_status || 'owned'
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
      res.status(500).json({ error: error.message });
    }
  },

  // Check all editions of a movie by TMDB ID
  checkMovieEditions: async (req, res) => {
    try {
      const { tmdb_id } = req.query;
      
      if (!tmdb_id) {
        return res.status(400).json({ error: 'tmdb_id is required' });
      }

      try {
        const editions = await Movie.findAllByTmdbId(tmdb_id);
        
        if (editions && editions.length > 0) {
          res.json({
            exists: true,
            count: editions.length,
            editions: editions.map(ed => ({
              id: ed.id,
              title: ed.title,
              format: ed.format,
              title_status: ed.title_status || 'owned',
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
        return res.status(500).json({ error: 'Database error: ' + dbError.message });
      }
    } catch (error) {
      logger.error('Error checking movie editions:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Toggle watch_next status for a movie
  toggleWatchNext: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await Movie.toggleWatchNext(id);
      res.json(result);
    } catch (error) {
      logger.error('Error toggling watch_next:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get available posters from TMDB
  getMoviePosters: async (req, res) => {
    try {
      const { tmdbId } = req.params;
      const { mediaType } = req.query; // Get media_type from query parameter
      const posters = await tmdbService.getMoviePosters(tmdbId, mediaType);
      res.json(posters);
    } catch (error) {
      logger.error('Error fetching movie posters:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Upload custom poster for a movie
  uploadCustomPoster: async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const file = req.file;
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
      await new Promise((resolve, reject) => {
        const sql = 'UPDATE movies SET poster_path = ? WHERE id = ?';
        db.run(sql, [posterPath, id], function(err) {
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
      res.status(500).json({ error: error.message });
    }
  },

  // Get all unique collection names for autocomplete (only user collections)
  getCollectionNames: async (req, res) => {
    try {
      const collectionService = require('../services/collectionService');
      const collections = await collectionService.getAllCollections();
      
      // Filter to only show user collections (not system or box_set collections)
      const userCollections = collections
        .filter(c => c.type === 'user')
        .map(c => c.name)
        .sort();
      
      res.json(userCollections);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get the highest order number for a collection

  // Get movies by collection name
  getMoviesByCollection: async (req, res) => {
    try {
      const { collectionName } = req.query;
      if (!collectionName) {
        return res.status(400).json({ error: 'Collection name is required' });
      }

      console.log('Looking for collection:', collectionName);
      const collectionService = require('../services/collectionService');
      const collection = await collectionService.findByName(collectionName);
      
      if (!collection) {
        console.log('Collection not found:', collectionName);
        return res.status(404).json({ error: 'Collection not found' });
      }

      console.log('Found collection:', collection.id, collection.name);
      const result = await collectionService.getCollectionMovies(collection.id);
      const movies = result.movies;

      // Parse cast field and validate image paths
      const parsedMovies = movies.map(movie => {
        const validatedMovie = Movie.validateImagePaths(movie);
        return {
          ...validatedMovie,
          cast: Array.isArray(validatedMovie.cast) ? validatedMovie.cast : (validatedMovie.cast ? JSON.parse(validatedMovie.cast) : [])
        };
      });

      res.json(parsedMovies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===== COLLECTION ENDPOINTS =====

  // Get Watch Next movies
  getWatchNextMovies: async (req, res) => {
    try {
      const movies = await collectionService.getWatchNextMovies();
      res.json(movies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get all collections
  getAllCollections: async (req, res) => {
    try {
      const collections = await collectionService.getAllCollections();
      res.json(collections);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get collection suggestions for typeahead
  getCollectionSuggestions: async (req, res) => {
    try {
      const { q = '' } = req.query;
      const suggestions = await collectionService.getSuggestions(q);
      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Update collection name
  updateCollection: async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Collection name is required' });
      }
      
      const updatedCollection = await collectionService.updateCollection(id, name.trim());
      res.json(updatedCollection);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Clean up empty collections
  cleanupEmptyCollections: async (req, res) => {
    try {
      const result = await collectionService.cleanupEmptyCollections();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Create a new collection
  createCollection: async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Collection name is required' });
      }

      const collection = await collectionService.createCollection(name.trim());
      res.status(201).json(collection);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Update collection name
  updateCollection: async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Collection name is required' });
      }

      const result = await collectionService.updateCollection(id, name.trim());
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Delete collection
  deleteCollection: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await collectionService.deleteCollection(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get movies in a collection
  getCollectionMovies: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await collectionService.getCollectionMovies(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Add movie to collection
  addMovieToCollection: async (req, res) => {
    try {
      const { id } = req.params;
      const { collectionName, collectionType = 'user' } = req.body;
      
      if (!collectionName || !collectionName.trim()) {
        return res.status(400).json({ error: 'Collection name is required' });
      }

      const result = await collectionService.addMovieToCollection(id, collectionName.trim(), collectionType);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Remove movie from collection
  removeMovieFromCollection: async (req, res) => {
    try {
      const { movieId, collectionId } = req.params;
      const result = await collectionService.removeMovieFromCollection(movieId, collectionId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Update movie's collections (replaces all collections)
  updateMovieCollections: async (req, res) => {
    try {
      const { id } = req.params;
      const { collectionNames = [] } = req.body;
      
      const result = await collectionService.updateMovieCollections(id, collectionNames);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get movie's collections
  getMovieCollections: async (req, res) => {
    try {
      const { id } = req.params;
      const collections = await collectionService.getMovieCollections(id);
      res.json(collections);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Handle collection name change (rename vs create new)
  handleCollectionNameChange: async (req, res) => {
    try {
      const { oldName, newName, action } = req.body;
      
      if (!oldName || !newName || !action) {
        return res.status(400).json({ error: 'oldName, newName, and action are required' });
      }

      if (!['rename', 'create'].includes(action)) {
        return res.status(400).json({ error: 'action must be "rename" or "create"' });
      }

      const result = await collectionService.handleCollectionNameChange(oldName, newName, action);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Update movie order in collection
  updateMovieOrder: async (req, res) => {
    try {
      const { movieId, collectionId } = req.params;
      const { order } = req.body;
      
      if (order === undefined || order === null) {
        return res.status(400).json({ error: 'Order is required' });
      }

      const result = await collectionService.updateMovieOrder(movieId, collectionId, order);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Clean up empty collections
  cleanupEmptyCollections: async (req, res) => {
    try {
      const result = await collectionService.cleanupEmptyCollections();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = movieController;
module.exports.posterUploadMiddleware = posterUpload.single('poster');
