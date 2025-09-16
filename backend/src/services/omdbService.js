const axios = require('axios');
const configManager = require('../config');

const OMDB_BASE_URL = 'http://www.omdbapi.com/';

const getOmdbApiKey = () => {
  try {
    return configManager.getApiKeys().omdb || process.env.OMDB_API_KEY || 'demo';
  } catch (error) {
    return process.env.OMDB_API_KEY || 'demo';
  }
};

const omdbService = {
  // Search for a movie by title and year
  searchMovie: async (title, year = null) => {
    try {
      const params = {
        apikey: getOmdbApiKey(),
        t: title,
        type: 'movie',
        plot: 'short'
      };
      
      if (year) {
        params.y = year;
      }

      const response = await axios.get(OMDB_BASE_URL, { params });
      
      if (response.data.Response === 'False') {
        throw new Error(response.data.Error || 'Movie not found');
      }

      return {
        title: response.data.Title,
        year: parseInt(response.data.Year),
        imdbID: response.data.imdbID !== 'N/A' ? response.data.imdbID : null,
        imdbRating: response.data.imdbRating !== 'N/A' ? parseFloat(response.data.imdbRating) : null,
        rottenTomatoRating: response.data.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value?.replace('%', '') || null,
        plot: response.data.Plot !== 'N/A' ? response.data.Plot : null,
        director: response.data.Director !== 'N/A' ? response.data.Director : null,
        genre: response.data.Genre !== 'N/A' ? response.data.Genre : null,
        cast: response.data.Actors !== 'N/A' ? response.data.Actors.split(',').map(actor => actor.trim()).filter(actor => actor) : []
      };
    } catch (error) {
      console.error('OMDB API error:', error.message);
      throw new Error(`Failed to fetch movie data: ${error.message}`);
    }
  },

  // Get movie ratings only (lighter API call)
  getMovieRatings: async (title, year = null) => {
    try {
      const params = {
        apikey: getOmdbApiKey(),
        t: title,
        type: 'movie'
      };
      
      if (year) {
        params.y = year;
      }

      const response = await axios.get(OMDB_BASE_URL, { params });
      
      if (response.data.Response === 'False') {
        return { imdbRating: null, rottenTomatoRating: null };
      }

      const imdbRating = response.data.imdbRating !== 'N/A' ? parseFloat(response.data.imdbRating) : null;
      const rottenTomatoRating = response.data.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value?.replace('%', '') || null;

      return { imdbRating, rottenTomatoRating };
    } catch (error) {
      console.error('OMDB API error:', error.message);
      return { imdbRating: null, rottenTomatoRating: null };
    }
  },

  // Get movie by IMDB ID
  getMovieByImdbId: async (imdbId) => {
    try {
      const params = {
        apikey: getOmdbApiKey(),
        i: imdbId,
        plot: 'short'
      };

      const response = await axios.get(OMDB_BASE_URL, { params });
      
      if (response.data.Response === 'False') {
        throw new Error(response.data.Error || 'Movie not found');
      }

      return {
        title: response.data.Title,
        year: parseInt(response.data.Year),
        imdbID: response.data.imdbID !== 'N/A' ? response.data.imdbID : null,
        imdbRating: response.data.imdbRating !== 'N/A' ? parseFloat(response.data.imdbRating) : null,
        rottenTomatoRating: response.data.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value?.replace('%', '') || null,
        plot: response.data.Plot !== 'N/A' ? response.data.Plot : null,
        director: response.data.Director !== 'N/A' ? response.data.Director : null,
        genre: response.data.Genre !== 'N/A' ? response.data.Genre : null,
        cast: response.data.Actors !== 'N/A' ? response.data.Actors.split(',').map(actor => actor.trim()).filter(actor => actor) : []
      };
    } catch (error) {
      console.error('OMDB API error:', error.message);
      throw new Error(`Failed to fetch movie data: ${error.message}`);
    }
  }
};

module.exports = omdbService;
