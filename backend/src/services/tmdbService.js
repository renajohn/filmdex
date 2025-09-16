const axios = require('axios');
const configManager = require('../config');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const getTmdbApiKey = () => {
  try {
    return configManager.getApiKeys().tmdb || process.env.TMDB_API_KEY;
  } catch (error) {
    return process.env.TMDB_API_KEY;
  }
};

const tmdbService = {
  // Search for multiple movies by title and year
  searchMovies: async (query, year = null) => {
    try {
      const apiKey = getTmdbApiKey();
      if (!apiKey) {
        console.warn('TMDB_API_KEY not found, returning empty array for external data');
        return [];
      }

      const params = {
        api_key: apiKey,
        query: query,
        include_adult: false
      };
      
      if (year) {
        params.year = year;
      }

      const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, { params });
      
      if (!response.data.results || response.data.results.length === 0) {
        return [];
      }

      // Return all results, formatted for our application
      return response.data.results.map(movie => ({
        id: movie.id,
        title: movie.title,
        original_title: movie.original_title,
        release_date: movie.release_date,
        overview: movie.overview,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        vote_average: movie.vote_average,
        vote_count: movie.vote_count,
        popularity: movie.popularity,
        adult: movie.adult,
        video: movie.video,
        media_type: 'movie'
      }));
    } catch (error) {
      console.error('TMDB search error:', error.message);
      return [];
    }
  },

  // Search for TV shows by title and year
  searchTVShows: async (query, year = null) => {
    try {
      if (!getTmdbApiKey()) {
        console.warn('TMDB_API_KEY not found, returning empty array for external data');
        return [];
      }

      const params = {
        api_key: getTmdbApiKey(),
        query: query,
        include_adult: false
      };
      
      if (year) {
        params.first_air_date_year = year;
      }

      const response = await axios.get(`${TMDB_BASE_URL}/search/tv`, { params });
      
      if (!response.data.results || response.data.results.length === 0) {
        return [];
      }

      // Return all results, formatted for our application
      return response.data.results.map(tv => ({
        id: tv.id,
        title: tv.name,
        original_title: tv.original_name,
        release_date: tv.first_air_date,
        overview: tv.overview,
        poster_path: tv.poster_path,
        backdrop_path: tv.backdrop_path,
        vote_average: tv.vote_average,
        vote_count: tv.vote_count,
        popularity: tv.popularity,
        adult: tv.adult,
        video: false, // TV shows don't have video field
        media_type: 'tv',
        first_air_date: tv.first_air_date,
        origin_country: tv.origin_country
      }));
    } catch (error) {
      console.error('TMDB TV search error:', error.message);
      return [];
    }
  },

  // Combined search for both movies and TV shows
  searchAll: async (query, year = null) => {
    try {
      const [movies, tvShows] = await Promise.all([
        tmdbService.searchMovies(query, year),
        tmdbService.searchTVShows(query, year)
      ]);

      // Combine and sort by popularity
      const allResults = [...movies, ...tvShows];
      return allResults.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } catch (error) {
      console.error('TMDB combined search error:', error.message);
      return [];
    }
  },

  // Search for a movie by title and year (returns single result)
  searchMovie: async (title, year = null) => {
    try {
      if (!getTmdbApiKey()) {
        console.warn('TMDB_API_KEY not found, returning null for external data');
        return null;
      }

      const params = {
        api_key: getTmdbApiKey(),
        query: title,
        include_adult: false
      };
      
      if (year) {
        params.year = year;
      }

      const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, { params });
      
      if (!response.data.results || response.data.results.length === 0) {
        return null;
      }

      // Return the first result
      const movie = response.data.results[0];
      
      return await tmdbService.getMovieDetails(movie.id);
    } catch (error) {
      console.error('TMDB search error:', error.message);
      return null;
    }
  },

  // Get detailed movie information including cast and videos
  getMovieDetails: async (tmdbId) => {
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
      ]);

      const movie = movieResponse.data;
      const credits = creditsResponse.data;
      const videos = videosResponse.data;
      const externalIds = externalIdsResponse.data;

      // Find the official trailer
      const trailer = videos.results.find(video => 
        video.type === 'Trailer' && 
        video.site === 'YouTube'
      );

      const movieData = {
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
        runtime: movie.runtime,
        budget: movie.budget,
        revenue: movie.revenue,
        status: movie.status,
        imdb_id: externalIds.imdb_id,
        media_type: 'movie',
        credits: {
          cast: credits.cast.slice(0, 10).map(actor => ({
            name: actor.name,
            profile_path: actor.profile_path
          })),
          crew: credits.crew.map(person => ({
            name: person.name,
            job: person.job,
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
      console.error('TMDB details error:', error.message);
      return null;
    }
  },

  // Get detailed TV show information
  getTVShowDetails: async (tmdbId) => {
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
      ]);

      const tv = tvResponse.data;
      const credits = creditsResponse.data;
      const videos = videosResponse.data;
      const externalIds = externalIdsResponse.data;

      // Find the official trailer
      const trailer = videos.results.find(video => 
        video.type === 'Trailer' && 
        video.site === 'YouTube'
      );

      const tvData = {
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
        imdb_id: externalIds.imdb_id,
        media_type: 'tv',
        first_air_date: tv.first_air_date,
        last_air_date: tv.last_air_date,
        number_of_episodes: tv.number_of_episodes,
        number_of_seasons: tv.number_of_seasons,
        origin_country: tv.origin_country,
        credits: {
          cast: credits.cast.slice(0, 10).map(actor => ({
            name: actor.name,
            profile_path: actor.profile_path
          })),
          crew: credits.crew.map(person => ({
            name: person.name,
            job: person.job,
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
      console.error('TMDB TV details error:', error.message);
      return null;
    }
  },

  // Get TMDB genres (both movie and TV)
  getGenres: async () => {
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
      ]);

      // Combine and deduplicate genres
      const allGenres = [...movieGenres.data.genres, ...tvGenres.data.genres];
      const uniqueGenres = allGenres.filter((genre, index, self) => 
        index === self.findIndex(g => g.id === genre.id)
      );

      return uniqueGenres;
    } catch (error) {
      console.error('TMDB genres error:', error.message);
      return [];
    }
  }
};

module.exports = tmdbService;
