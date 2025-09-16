const axios = require('axios');
const tmdbService = require('./tmdbService');

const posterService = {
  
  // Extract IMDB ID from IMDB URL
  extractImdbId: (imdbUrl) => {
    if (!imdbUrl) return null;
    
    // Handle different IMDB URL formats
    const patterns = [
      /\/title\/(tt\d+)/,  // https://www.imdb.com/title/tt1234567
      /tt\d+/,             // Just the ID: tt1234567
      /imdb\.com\/title\/(tt\d+)/  // Various domain formats
    ];
    
    for (const pattern of patterns) {
      const match = imdbUrl.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
    
    return null;
  },

  // Get poster from TMDb API (primary source)
  getPosterFromTmdb: async (imdbId) => {
    try {
      // TMDb API key - you'll need to get one from https://www.themoviedb.org/settings/api
      const tmdbApiKey = process.env.TMDB_API_KEY || 'your_tmdb_api_key_here';
      
      if (tmdbApiKey === 'your_tmdb_api_key_here') {
        console.warn('TMDb API key not configured');
        return null;
      }

      // Find movie by IMDB ID
      const findResponse = await axios.get(
        `https://api.themoviedb.org/3/find/${imdbId}`,
        {
          params: {
            api_key: tmdbApiKey,
            external_source: 'imdb_id'
          }
        }
      );

      if (findResponse.data.movie_results && findResponse.data.movie_results.length > 0) {
        const movie = findResponse.data.movie_results[0];
        if (movie.poster_path) {
          // Return direct TMDB URL
          return `https://image.tmdb.org/t/p/w780${movie.poster_path}`;
        }
      }
      
      return null;
    } catch (error) {
      console.warn('TMDb API error:', error.message);
      return null;
    }
  },

  // Get poster from OMDb API (fallback)
  getPosterFromOmdb: async (imdbId) => {
    try {
      // OMDb API key - you can get one from http://www.omdbapi.com/apikey.aspx
      const omdbApiKey = process.env.OMDB_API_KEY || 'your_omdb_api_key_here';
      
      if (omdbApiKey === 'your_omdb_api_key_here') {
        console.warn('OMDb API key not configured');
        return null;
      }

      const response = await axios.get('http://www.omdbapi.com/', {
        params: {
          i: imdbId,
          apikey: omdbApiKey
        }
      });

      if (response.data.Poster && response.data.Poster !== 'N/A') {
        return response.data.Poster;
      }
      
      return null;
    } catch (error) {
      console.warn('OMDb API error:', error.message);
      return null;
    }
  },

  // Get poster from MyAPIFilms (fallback)
  getPosterFromMyApiFilms: async (imdbId) => {
    try {
      // MyAPIFilms token - you need to request one from https://www.myapifilms.com/
      const myApiFilmsToken = process.env.MYAPIFILMS_TOKEN || 'your_myapifilms_token_here';
      
      if (myApiFilmsToken === 'your_myapifilms_token_here') {
        console.warn('MyAPIFilms token not configured');
        return null;
      }

      const response = await axios.get(
        `https://www.myapifilms.com/imdb/image/${imdbId}`,
        {
          params: {
            token: myApiFilmsToken
          }
        }
      );

      // MyAPIFilms returns the image directly, so we return the URL
      if (response.status === 200 && response.headers['content-type']?.includes('image')) {
        return `https://www.myapifilms.com/imdb/image/${imdbId}?token=${myApiFilmsToken}`;
      }
      
      return null;
    } catch (error) {
      console.warn('MyAPIFilms API error:', error.message);
      return null;
    }
  },

  // Generate placeholder poster URL
  getPlaceholderPoster: (title, year) => {
    // Use a service that generates movie-style placeholder images
    const cleanTitle = encodeURIComponent(title || 'Movie');
    const cleanYear = year || '2024';
    return `https://via.placeholder.com/500x750/1a1a1a/ffffff?text=${cleanTitle}+(${cleanYear})`;
  },

  // Main function to get movie poster with fallbacks
  getMoviePoster: async (imdbUrl, title = null, year = null) => {
    try {
      const imdbId = posterService.extractImdbId(imdbUrl);
      
      if (!imdbId) {
        console.warn('Could not extract IMDB ID from URL:', imdbUrl);
        return {
          success: false,
          posterUrl: posterService.getPlaceholderPoster(title, year),
          source: 'placeholder',
          error: 'Invalid IMDB URL'
        };
      }

      // Try TMDb first (best quality)
      let posterUrl = await posterService.getPosterFromTmdb(imdbId);
      if (posterUrl) {
        return {
          success: true,
          posterUrl: posterUrl,
          source: 'tmdb',
          imdbId: imdbId
        };
      }

      // Try OMDb as fallback
      posterUrl = await posterService.getPosterFromOmdb(imdbId);
      if (posterUrl) {
        return {
          success: true,
          posterUrl: posterUrl,
          source: 'omdb',
          imdbId: imdbId
        };
      }

      // Try MyAPIFilms as last resort
      posterUrl = await posterService.getPosterFromMyApiFilms(imdbId);
      if (posterUrl) {
        return {
          success: true,
          posterUrl: posterUrl,
          source: 'myapifilms',
          imdbId: imdbId
        };
      }

      // All APIs failed, return placeholder
      return {
        success: false,
        posterUrl: posterService.getPlaceholderPoster(title, year),
        source: 'placeholder',
        imdbId: imdbId,
        error: 'No poster found from any API'
      };

    } catch (error) {
      console.error('Error getting movie poster:', error);
      return {
        success: false,
        posterUrl: posterService.getPlaceholderPoster(title, year),
        source: 'placeholder',
        error: error.message
      };
    }
  }
};

module.exports = posterService;
