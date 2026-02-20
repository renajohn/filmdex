import axios, { AxiosResponse } from 'axios';
import configManager from '../config';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const OMDB_BASE_URL = 'http://www.omdbapi.com/';

const getTmdbApiKey = (): string | undefined => {
  try {
    return configManager.getApiKeys().tmdb || process.env.TMDB_API_KEY;
  } catch (_error) {
    return process.env.TMDB_API_KEY;
  }
};

const getOmdbApiKey = (): string => {
  try {
    return configManager.getApiKeys().omdb || process.env.OMDB_API_KEY || 'demo';
  } catch (_error) {
    return process.env.OMDB_API_KEY || 'demo';
  }
};

type Country = 'FR' | 'DE' | 'GB' | 'NL' | 'US' | 'CH';

// Age mapping functions based on ChatGPT's research
const mapCertificationToAge = (certification: string | null | undefined, country: string): number | null => {
  const cert = certification?.toUpperCase();

  switch (country) {
    case 'FR':
      switch (cert) {
        case 'U':
        case 'TP': return 0;
        case '10': return 10;
        case '12': return 12;
        case '16': return 16;
        case '18': return 18;
        default: return null;
      }

    case 'DE':
      switch (cert) {
        case '0': return 0;
        case '6': return 6;
        case '12': return 12;
        case '16': return 16;
        case '18': return 18;
        default: return null;
      }

    case 'GB':
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

    case 'NL':
      switch (cert) {
        case 'AL': return 0;
        case '6': return 6;
        case '9': return 9;
        case '12': return 12;
        case '16': return 16;
        default: return null;
      }

    case 'US':
      switch (cert) {
        case 'G': return 6;
        case 'PG': return 10;
        case 'PG-13': return 13;
        case 'R': return 16;
        case 'NC-17': return 17;
        default: return null;
      }

    case 'CH':
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
const mapOmdbRatingToAge = (rated: string | null | undefined): number | null => {
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
const median = (arr: number[]): number | null => {
  if (arr.length === 0) return null;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

interface AgeOptions {
  mode?: 'median' | 'max';
  forceOmdb?: boolean;
}

type AgeGroup = 'all' | 'children' | 'kids' | 'teens' | 'adults' | 'unknown';

interface TMDBReleaseDatesResponse {
  results?: Array<{
    iso_3166_1: string;
    release_dates: Array<{
      certification: string;
      type: number;
    }>;
  }>;
}

interface TMDBContentRatingsResponse {
  results?: Array<{
    iso_3166_1: string;
    rating: string;
  }>;
}

interface OMDBResponse {
  Response: string;
  Rated?: string;
}

const ageRecommendationService = {
  // Get age recommendation for a movie using TMDB and OMDb
  getRecommendedAge: async (tmdbId: number | null, imdbId: string | null = null, options: AgeOptions = {}): Promise<number | null> => {
    const { mode = 'median' } = options;

    try {
      let ages: (number | null)[] = [];

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
      const filteredAges = ages.filter((age): age is number => age !== null);

      if (filteredAges.length === 0) {
        return null;
      }

      // Apply mode
      if (mode === 'max') {
        return Math.max(...filteredAges);
      } else {
        return Math.round(median(filteredAges)!);
      }
    } catch (error) {
      console.error('Error getting recommended age:', error);
      return null;
    }
  },

  // Get ages from TMDB release dates
  getTmdbAges: async (tmdbId: number): Promise<number[]> => {
    try {
      const apiKey = getTmdbApiKey();
      if (!apiKey) return [];

      const response: AxiosResponse<TMDBReleaseDatesResponse> = await axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}/release_dates`, {
        params: { api_key: apiKey }
      });

      if (!response.data.results) return [];

      const ages: number[] = [];
      const priorityCountries: Country[] = ['CH', 'FR', 'DE', 'GB', 'NL', 'US'];

      // Collect certifications by country
      const certificationsByCountry: Record<string, string[]> = {};
      response.data.results.forEach(result => {
        const country = result.iso_3166_1;
        if (priorityCountries.includes(country as Country)) {
          result.release_dates.forEach(release => {
            if (release.certification && release.type <= 3) {
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
  getOmdbAge: async (imdbId: string): Promise<number | null> => {
    try {
      const params: Record<string, string> = {
        apikey: getOmdbApiKey(),
        i: imdbId,
        type: 'movie'
      };

      const response: AxiosResponse<OMDBResponse> = await axios.get(OMDB_BASE_URL, { params });

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
  getRecommendedAgeForTV: async (tmdbId: number | null, imdbId: string | null = null, options: AgeOptions = {}): Promise<number | null> => {
    const { mode = 'median' } = options;

    try {
      let ages: (number | null)[] = [];

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

      const filteredAges = ages.filter((age): age is number => age !== null);

      if (filteredAges.length === 0) {
        return null;
      }

      if (mode === 'max') {
        return Math.max(...filteredAges);
      } else {
        return Math.round(median(filteredAges)!);
      }
    } catch (error) {
      console.error('Error getting recommended age for TV:', error);
      return null;
    }
  },

  // Get ages from TMDB content ratings for TV
  getTmdbTVAges: async (tmdbId: number): Promise<number[]> => {
    try {
      const apiKey = getTmdbApiKey();
      if (!apiKey) return [];

      const response: AxiosResponse<TMDBContentRatingsResponse> = await axios.get(`${TMDB_BASE_URL}/tv/${tmdbId}/content_ratings`, {
        params: { api_key: apiKey }
      });

      if (!response.data.results) return [];

      const ages: number[] = [];
      const priorityCountries: Country[] = ['CH', 'FR', 'DE', 'GB', 'NL', 'US'];

      // Collect ratings by country
      const ratingsByCountry: Record<string, string[]> = {};
      response.data.results.forEach(result => {
        const country = result.iso_3166_1;
        if (priorityCountries.includes(country as Country)) {
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
  formatAgeDisplay: (age: number | null | undefined): string => {
    if (age === null || age === undefined) {
      return 'ND'; // Non déterminé
    }
    return `${age}+`;
  },

  // Get age group category
  getAgeGroup: (age: number | null | undefined): AgeGroup => {
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
  getAgeGroupDisplayName: (ageGroup: string): string => {
    const names: Record<string, string> = {
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

export default ageRecommendationService;
