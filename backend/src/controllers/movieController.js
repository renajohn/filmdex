const movieService = require('../services/movieService');
const tmdbService = require('../services/tmdbService');
const omdbService = require('../services/omdbService');
const importService = require('../services/importService');
const imageService = require('../services/imageService');
const Movie = require('../models/movie');
const MovieCast = require('../models/movieCast');
const MovieCrew = require('../models/movieCrew');
const logger = require('../logger');

const movieController = {
  getAllMovies: async (req, res) => {
    try {
      const movies = await movieService.getAllMovies();
      // Parse cast field from JSON string back to array
      const parsedMovies = movies.map(movie => ({
        ...movie,
        cast: movie.cast ? JSON.parse(movie.cast) : []
      }));
      res.json(parsedMovies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  searchMovies: async (req, res) => {
    try {
      const criteria = req.query;
      const movies = await movieService.searchMovies(criteria);
      // Parse cast field from JSON string back to array
      const parsedMovies = movies.map(movie => ({
        ...movie,
        cast: movie.cast ? JSON.parse(movie.cast) : []
      }));
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
        import_id: 'manual-add'
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
      const { title, year, format, price, acquired_date, comments, never_seen, tmdb_id, tmdb_data } = req.body;
      
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
        import_id: 'manual-add'
      };

      // Check if movie already exists (by imdb_id or tmdb_id)
      let existingMovie = null;
      if (tmdbDetails.imdb_id) {
        existingMovie = await Movie.findByImdbId(tmdbDetails.imdb_id);
      }
      if (!existingMovie && tmdbMovie.id) {
        existingMovie = await Movie.findByTmdbId(tmdbMovie.id);
      }

      let result;
      if (existingMovie) {
        // Update existing movie with new collection data
        const updateData = {
          title: tmdbMovie.title,
          format: format || 'Blu-ray',
          price: price ? parseFloat(price) : null,
          acquired_date: acquired_date || new Date().toISOString().split('T')[0],
          comments: comments || '',
          never_seen: never_seen || false
        };
        
        await Movie.updateFields(existingMovie.id, updateData);
        result = await Movie.findById(existingMovie.id);
      } else {
        // Create new movie in database
        const createdMovie = await Movie.create(movieData);
        
        // Process cast and crew
        await importService.processCastAndCrew(createdMovie.id, tmdbDetails.credits, tmdbDetails.id);
        
        result = createdMovie;
      }

      res.json(result);
    } catch (error) {
      console.error('Error adding movie:', error);
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
  }
};

module.exports = movieController;
