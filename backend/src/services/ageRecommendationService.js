const axios = require('axios');
const configManager = require('../config');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const OMDB_BASE_URL = 'http://www.omdbapi.com/';

const getTmdbApiKey = () => {
  try {
    return configManager.getApiKeys().tmdb || process.env.TMDB_API_KEY;
  } catch (error) {
    return process.env.TMDB_API_KEY;
  }
};

const getOmdbApiKey = () => {
  try {
    return configManager.getApiKeys().omdb || process.env.OMDB_API_KEY || 'demo';
  } catch (error) {
    return process.env.OMDB_API_KEY || 'demo';
  }
};

// Age mapping functions based on ChatGPT's research
const mapCertificationToAge = (certification, country) => {
  const cert = certification?.toUpperCase();
  
  switch (country) {
    case 'FR': // France (CNC)
      switch (cert) {
        case 'U':
        case 'TP': return 0;
        case '10': return 10;
        case '12': return 12;
        case '16': return 16;
        case '18': return 18;
        default: return null;
      }
    
    case 'DE': // Germany (FSK)
      switch (cert) {
        case '0': return 0;
        case '6': return 6;
        case '12': return 12;
        case '16': return 16;
        case '18': return 18;
        default: return null;
      }
    
    case 'GB': // UK (BBFC)
      switch (cert) {
        case 'U': return 0;
        case 'PG': return 8;
        case '12':
        case '12A': return 12;
        case '15': return 15;
        case '18': return 18;
        case 'R18': return 18;
        default: return null;
      }
    
    case 'NL': // Netherlands (Kijkwijzer)
      switch (cert) {
        case 'AL': return 0;
        case '6': return 6;
        case '9': return 9;
        case '12': return 12;
        case '16': return 16;
        default: return null;
      }
    
    case 'US': // USA (MPA)
      switch (cert) {
        case 'G': return 6;
        case 'PG': return 10;
        case 'PG-13': return 13;
        case 'R': return 16;
        case 'NC-17': return 17;
        default: return null;
      }
    
    case 'CH': // Switzerland
      switch (cert) {
        case '0': return 0;
        case '6': return 6;
        case '12': return 12;
        case '16': return 16;
        case '18': return 18;
        default: return null;
      }
    
    default:
      return null;
  }
};

// Map OMDb ratings to age
const mapOmdbRatingToAge = (rated) => {
  if (!rated || rated === 'N/A') return null;
  
  const rating = rated.toUpperCase();
  switch (rating) {
    case 'G': return 6;
    case 'PG': return 10;
    case 'PG-13': return 13;
    case 'R': return 16;
    case 'NC-17': return 17;
    case 'TV-Y': return 0;
    case 'TV-Y7': return 7;
    case 'TV-PG': return 10;
    case 'TV-14': return 14;
    case 'TV-MA': return 16;
    default: return null;
  }
};

// Calculate median of an array
const median = (arr) => {
  if (arr.length === 0) return null;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
};

const ageRecommendationService = {
  // Get age recommendation for a movie using TMDB and OMDb
  getRecommendedAge: async (tmdbId, imdbId = null, options = {}) => {
    const { mode = 'median' } = options; // 'median' or 'max'
    
    try {
      let ages = [];
      
      // Try TMDB first
      if (tmdbId && getTmdbApiKey()) {
        const tmdbAges = await ageRecommendationService.getTmdbAges(tmdbId);
        ages = ages.concat(tmdbAges);
      }
      
      // Fallback to OMDb if no TMDB ages or if requested
      if ((ages.length === 0 || options.forceOmdb) && imdbId) {
        const omdbAge = await ageRecommendationService.getOmdbAge(imdbId);
        if (omdbAge !== null) {
          ages.push(omdbAge);
        }
      }
      
      // Filter out null values
      ages = ages.filter(age => age !== null);
      
      if (ages.length === 0) {
        return null; // No age recommendation available
      }
      
      // Apply mode
      if (mode === 'max') {
        return Math.max(...ages);
      } else {
        return Math.round(median(ages));
      }
    } catch (error) {
      console.error('Error getting recommended age:', error);
      return null;
    }
  },

  // Get ages from TMDB release dates
  getTmdbAges: async (tmdbId) => {
    try {
      const apiKey = getTmdbApiKey();
      if (!apiKey) return [];

      const response = await axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}/release_dates`, {
        params: { api_key: apiKey }
      });

      if (!response.data.results) return [];

      const ages = [];
      const priorityCountries = ['CH', 'FR', 'DE', 'GB', 'NL', 'US']; // Switzerland first, then neighbors
      
      // Collect certifications by country
      const certificationsByCountry = {};
      response.data.results.forEach(result => {
        const country = result.iso_3166_1;
        if (priorityCountries.includes(country)) {
          result.release_dates.forEach(release => {
            if (release.certification && release.type <= 3) { // Only theatrical releases
              if (!certificationsByCountry[country]) {
                certificationsByCountry[country] = [];
              }
              certificationsByCountry[country].push(release.certification);
            }
          });
        }
      });

      // Convert certifications to ages, prioritizing Switzerland
      priorityCountries.forEach(country => {
        if (certificationsByCountry[country]) {
          // Take the first (most common) certification for this country
          const cert = certificationsByCountry[country][0];
          const age = mapCertificationToAge(cert, country);
          if (age !== null) {
            ages.push(age);
          }
        }
      });

      return ages;
    } catch (error) {
      console.error('Error getting TMDB ages:', error);
      return [];
    }
  },

  // Get age from OMDb
  getOmdbAge: async (imdbId) => {
    try {
      const params = {
        apikey: getOmdbApiKey(),
        i: imdbId,
        type: 'movie'
      };

      const response = await axios.get(OMDB_BASE_URL, { params });
      
      if (response.data.Response === 'False') {
        return null;
      }

      return mapOmdbRatingToAge(response.data.Rated);
    } catch (error) {
      console.error('Error getting OMDb age:', error);
      return null;
    }
  },

  // Get age recommendation for TV shows
  getRecommendedAgeForTV: async (tmdbId, imdbId = null, options = {}) => {
    const { mode = 'median' } = options;
    
    try {
      let ages = [];
      
      // Try TMDB content ratings for TV
      if (tmdbId && getTmdbApiKey()) {
        const tmdbAges = await ageRecommendationService.getTmdbTVAges(tmdbId);
        ages = ages.concat(tmdbAges);
      }
      
      // Fallback to OMDb
      if ((ages.length === 0 || options.forceOmdb) && imdbId) {
        const omdbAge = await ageRecommendationService.getOmdbAge(imdbId);
        if (omdbAge !== null) {
          ages.push(omdbAge);
        }
      }
      
      ages = ages.filter(age => age !== null);
      
      if (ages.length === 0) {
        return null;
      }
      
      if (mode === 'max') {
        return Math.max(...ages);
      } else {
        return Math.round(median(ages));
      }
    } catch (error) {
      console.error('Error getting recommended age for TV:', error);
      return null;
    }
  },

  // Get ages from TMDB content ratings for TV
  getTmdbTVAges: async (tmdbId) => {
    try {
      const apiKey = getTmdbApiKey();
      if (!apiKey) return [];

      const response = await axios.get(`${TMDB_BASE_URL}/tv/${tmdbId}/content_ratings`, {
        params: { api_key: apiKey }
      });

      if (!response.data.results) return [];

      const ages = [];
      const priorityCountries = ['CH', 'FR', 'DE', 'GB', 'NL', 'US'];
      
      // Collect ratings by country
      const ratingsByCountry = {};
      response.data.results.forEach(result => {
        const country = result.iso_3166_1;
        if (priorityCountries.includes(country)) {
          if (!ratingsByCountry[country]) {
            ratingsByCountry[country] = [];
          }
          ratingsByCountry[country].push(result.rating);
        }
      });

      // Convert ratings to ages
      priorityCountries.forEach(country => {
        if (ratingsByCountry[country]) {
          const rating = ratingsByCountry[country][0];
          const age = mapCertificationToAge(rating, country);
          if (age !== null) {
            ages.push(age);
          }
        }
      });

      return ages;
    } catch (error) {
      console.error('Error getting TMDB TV ages:', error);
      return [];
    }
  },

  // Format age for display
  formatAgeDisplay: (age) => {
    if (age === null || age === undefined) {
      return 'ND'; // Non déterminé
    }
    return `${age}+`;
  },

  // Get age group category
  getAgeGroup: (age) => {
    if (age === null || age === undefined) {
      return 'unknown';
    }
    
    if (age === 0) return 'all';
    if (age <= 6) return 'children';
    if (age <= 12) return 'kids';
    if (age <= 16) return 'teens';
    return 'adults';
  },

  // Get age group display name
  getAgeGroupDisplayName: (ageGroup) => {
    const names = {
      'all': 'All Ages',
      'children': 'Children',
      'kids': 'Kids/Pre-teens',
      'teens': 'Teens',
      'adults': 'Adults',
      'unknown': 'Not Rated'
    };
    return names[ageGroup] || 'Not Rated';
  }
};

module.exports = ageRecommendationService;
