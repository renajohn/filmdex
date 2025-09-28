const Movie = require('../models/movie');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const omdbService = require('./omdbService');
const posterService = require('./posterService');
const tmdbService = require('./tmdbService');
const { getDatabase } = require('../database');
const logger = require('../logger');




// Helper function to parse date from various formats
const parseDate = (dateValue) => {
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
const parseReleaseDate = (dateValue) => {
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
const generateImdbLink = (title, release_date) => {
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



  getAllMovies: () => {
    return Movie.findAll();
  },

  searchMovies: (criteria) => {
    return Movie.search(criteria);
  },

  getFormats: () => {
    return Movie.getFormats();
  },

  getMovieById: (id) => {
    return Movie.findById(id);
  },

  // Automatically fetch ratings for a movie
  fetchMovieRatings: async (title, release_date = null) => {
    try {
      const year = release_date ? new Date(release_date).getFullYear() : null;
      const ratings = await omdbService.getMovieRatings(title, year);
      return ratings;
    } catch (error) {
      console.error('Error fetching ratings:', error.message);
      return { imdbRating: null, rottenTomatoRating: null };
    }
  },

  // Create a movie with automatic rating fetching
  createMovieWithRatings: async (movieData) => {
    try {
      // If ratings are missing, try to fetch them
      if (!movieData.imdb_rating || !movieData.rotten_tomato_rating) {
        logger.debug('Fetching ratings for:', movieData.title);
        const year = movieData.release_date ? new Date(movieData.release_date).getFullYear() : null;
        const ratings = await omdbService.getMovieRatings(movieData.title, year);
        
        if (ratings.imdbRating && !movieData.imdb_rating) {
          movieData.imdb_rating = ratings.imdbRating;
        }
        if (ratings.rottenTomatoRating && !movieData.rotten_tomato_rating) {
          movieData.rotten_tomato_rating = parseInt(ratings.rottenTomatoRating);
        }
      }

      // If recommended age is missing, try to fetch it
      if (!movieData.recommended_age && (movieData.tmdb_id || movieData.imdb_id)) {
        logger.debug('Fetching recommended age for:', movieData.title);
        try {
          const ageRecommendationService = require('./ageRecommendationService');
          const recommendedAge = movieData.media_type === 'tv' 
            ? await ageRecommendationService.getRecommendedAgeForTV(movieData.tmdb_id, movieData.imdb_id)
            : await ageRecommendationService.getRecommendedAge(movieData.tmdb_id, movieData.imdb_id);
          
          if (recommendedAge !== null) {
            movieData.recommended_age = recommendedAge;
            movieData.age_processed = true;
          }
        } catch (ageError) {
          logger.warn('Failed to fetch recommended age for:', movieData.title, ageError.message);
          // Continue without age - it can be backfilled later
        }
      }

      return await Movie.create(movieData);
    } catch (error) {
      console.error('Error creating movie with ratings:', error.message);
      throw error;
    }
  },



  // Get movie thumbnail from IMDB
  getMovieThumbnail: async (imdbLink, title = null, year = null) => {
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
      console.error('Error fetching movie thumbnail:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Get movie backdrop URL
  getMovieBackdrop: async (tmdbId) => {
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
  getMovieDetails: async (movieId) => {
    try {
      // Get local movie data
      const localMovie = await Movie.findById(movieId);
      if (!localMovie) {
        throw new Error('Movie not found');
      }

      // Fetch TMDB data based on media type
      let tmdbData = null;
      if (localMovie.tmdb_id) {
        if (localMovie.media_type === 'tv') {
          tmdbData = await tmdbService.getTVShowDetails(localMovie.tmdb_id);
        } else {
          tmdbData = await tmdbService.getMovieDetails(localMovie.tmdb_id);
        }
      }
      
      // If no TMDB data found, try searching by title
      if (!tmdbData) {
        const year = localMovie.release_date ? new Date(localMovie.release_date).getFullYear() : null;
        tmdbData = await tmdbService.searchMovie(localMovie.title, year);
      }
      
      // Combine local and TMDB data (prioritize spreadsheet data)
      const movieDetails = {
        // Database ID - this is crucial for updates
        id: localMovie.id,
        // Local database fields
        title: localMovie.title,
        original_title: localMovie.original_title || null,
        original_language: localMovie.original_language || null,
        plot: localMovie.plot,
        genre: localMovie.genre,
        director: localMovie.director,
        cast: Array.isArray(localMovie.cast) ? localMovie.cast : (localMovie.cast ? JSON.parse(localMovie.cast) : []),
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
        year: localMovie.release_date ? new Date(localMovie.release_date).getFullYear() : null,
        format: localMovie.format,
        acquired_date: localMovie.acquired_date,
        
        // Use local plot as overview
        overview: localMovie.plot || null,
        
        // Local database fields
        poster_path: localMovie.poster_path || null,
        adult: localMovie.adult || false,
        genres: localMovie.genre || [],
        trailer_key: localMovie.trailer_key || null,
        trailer_site: localMovie.trailer_site || null,
        tmdb_id: localMovie.tmdb_id || null,
        imdb_id: localMovie.imdb_id || null,
        backdrop_path: localMovie.backdrop_path || null,
        popularity: localMovie.popularity || null,
        vote_count: localMovie.vote_count || null,
        video: localMovie.video || false,
        budget: localMovie.budget || null,
        revenue: localMovie.revenue || null,
        status: localMovie.status || null,
        recommended_age: localMovie.recommended_age || null,
        age_processed: localMovie.age_processed || false,
        title_status: localMovie.title_status || 'owned',
      };

      return movieDetails;
    } catch (error) {
      console.error('Error fetching movie details:', error);
      throw error;
    }
  },

  async getAutocompleteSuggestions(field, query) {
    try {
      const db = getDatabase();
      
      let sql = '';
      let params = [];
      
      switch (field) {
        case 'title':
          sql = `SELECT DISTINCT title FROM movies WHERE title LIKE ? ORDER BY title LIMIT 10`;
          params = [`%${query}%`];
          break;
        case 'director':
          sql = `SELECT DISTINCT director FROM movies WHERE director IS NOT NULL AND director != '' AND director LIKE ? ORDER BY director LIMIT 10`;
          params = [`%${query}%`];
          break;
        case 'genre':
          sql = `SELECT DISTINCT genre FROM movies WHERE genre IS NOT NULL AND genre != '' AND genre LIKE ? ORDER BY genre LIMIT 10`;
          params = [`%${query}%`];
          break;
        case 'actor':
          sql = `SELECT DISTINCT value as actor FROM movies, json_each(cast) WHERE value LIKE ? ORDER BY value LIMIT 10`;
          params = [`%${query}%`];
          break;
        case 'format':
          sql = `SELECT DISTINCT format FROM movies WHERE format IS NOT NULL AND format != '' AND format LIKE ? ORDER BY format LIMIT 10`;
          params = [`%${query}%`];
          break;
        case 'year':
          sql = `SELECT DISTINCT strftime('%Y', release_date) as year FROM movies WHERE release_date IS NOT NULL AND release_date LIKE ? ORDER BY year DESC LIMIT 10`;
          params = [`%${query}%`];
          break;
        case 'minImdbRating':
        case 'minRottenTomatoRating':
          // These are numeric fields, no autocomplete needed
          return [];
        default:
          return [];
      }
      
      const rows = await new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
      return rows.map(row => row[field] || row.actor || row.year);
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      return [];
    }
  },

  updateMovie: async (id, movieData) => {
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
          (movieData[key] === undefined || movieData[key] === null)
        ) {
          movieData[key] = existingMovie[key];
        }
      }

      // Update the movie in the database
      const result = await Movie.update(id, movieData);
      
      if (result.changes === 0) {
        return null; // No changes made, movie not found
      }

      // Return the updated movie data with parsed cast field
      const updatedMovie = await Movie.findById(id);
      if (updatedMovie) {
        // Parse cast field from JSON string back to array
        updatedMovie.cast = Array.isArray(updatedMovie.cast) ? updatedMovie.cast : (updatedMovie.cast ? JSON.parse(updatedMovie.cast) : []);
      }
      return updatedMovie;
    } catch (error) {
      console.error('Error updating movie:', error);
      throw error;
    }
  },

  deleteMovie: async (id) => {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM movies WHERE id = ?', [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, deletedRows: this.changes });
        }
      });
    });
  },

  // Refresh movie ratings from external sources
  refreshMovieRatings: async (movieId) => {
    try {
      // Get the current movie data
      const movie = await Movie.findById(movieId);
      if (!movie) {
        throw new Error('Movie not found');
      }

      // If no TMDB ID, try to find it by searching
      let tmdbData = null;
      if (movie.tmdb_id) {
        // Get fresh TMDB data
        if (movie.media_type === 'tv') {
          tmdbData = await tmdbService.getTVShowDetails(movie.tmdb_id);
        } else {
          tmdbData = await tmdbService.getMovieDetails(movie.tmdb_id);
        }
      } else {
        // Search for TMDB data by title
        const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null;
        tmdbData = await tmdbService.searchMovie(movie.title, year);
      }

      if (!tmdbData) {
        throw new Error('Could not fetch TMDB data');
      }

      // Get OMDB ratings if we have IMDB ID
      let imdbRating = null;
      let rottenTomatoRating = null;
      if (tmdbData.imdb_id) {
        try {
          console.log('Fetching OMDB data for IMDB ID:', tmdbData.imdb_id);
          const omdbData = await omdbService.getMovieByImdbId(tmdbData.imdb_id);
          console.log('OMDB data received:', {
            imdbRating: omdbData?.imdbRating,
            rottenTomatoRating: omdbData?.rottenTomatoRating
          });
          
          imdbRating = omdbData?.imdbRating ? parseFloat(omdbData.imdbRating) : null;
          rottenTomatoRating = omdbData?.rottenTomatoRating ? parseInt(omdbData.rottenTomatoRating) : null;
          
          console.log('Parsed ratings:', { imdbRating, rottenTomatoRating });
        } catch (error) {
          console.warn('Failed to fetch OMDB ratings:', error.message);
        }
      } else {
        console.log('No IMDB ID available for OMDB lookup, trying title search');
        // Try to get OMDB data by title as fallback
        try {
          const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null;
          console.log('Searching OMDB by title:', movie.title, 'year:', year);
          const omdbData = await omdbService.searchMovie(movie.title, year);
          console.log('OMDB data by title:', {
            imdbRating: omdbData?.imdbRating,
            rottenTomatoRating: omdbData?.rottenTomatoRating
          });
          
          imdbRating = omdbData?.imdbRating ? parseFloat(omdbData.imdbRating) : null;
          rottenTomatoRating = omdbData?.rottenTomatoRating ? parseInt(omdbData.rottenTomatoRating) : null;
          
          console.log('Parsed ratings from title search:', { imdbRating, rottenTomatoRating });
        } catch (error) {
          console.warn('Failed to fetch OMDB ratings by title:', error.message);
        }
      }

      // Update only the ratings and related fields, preserve all other data
      const updateData = {
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
      console.log('Updating database with:', updateData);
      const updateResult = await Movie.updateFields(movieId, updateData);
      console.log('Database update result:', updateResult);

      // Return updated movie data
      const updatedMovie = await Movie.findById(movieId);
      
      console.log('Returning updated movie data:', {
        id: updatedMovie.id,
        tmdb_rating: updatedMovie.tmdb_rating,
        imdb_rating: updatedMovie.imdb_rating,
        rotten_tomato_rating: updatedMovie.rotten_tomato_rating,
        vote_count: updatedMovie.vote_count,
        popularity: updatedMovie.popularity
      });
      
      return updatedMovie;

    } catch (error) {
      console.error('Error refreshing movie ratings:', error);
      throw error;
    }
  }
};

module.exports = movieService;
