
import { Request, Response } from 'express';
import Movie from '../models/movie';
import MovieCast from '../models/movieCast';
import MovieCrew from '../models/movieCrew';
import Album from '../models/album';
import Track from '../models/track';
import Book from '../models/book';
import { getDatabase } from '../database';
import logger from '../logger';
import cacheService from '../services/cacheService';
import type { MovieData, AlbumFormatted, TrackFormatted, BookFormatted } from '../types';

interface AnalyticsData {
  [key: string]: unknown;
}

const analyticsController = {
  getAnalytics: async (req: Request, res: Response): Promise<void> => {
    try {
      // Check cache first
      const cacheKey = cacheService.generateCacheKey('analytics', {});
      console.log(`🎬 FILMDEX: Checking cache with key: ${cacheKey}`);
      const cachedAnalytics = await cacheService.get(cacheKey);

      if (cachedAnalytics) {
        logger.info('📊 FILMDEX Analytics served from cache (fast)');
        res.json(cachedAnalytics);
        return;
      }

      logger.info('🔄 FILMDEX Analytics generating fresh data (slow)');
      const db = getDatabase();
      const analytics: AnalyticsData = {};

      // Get all owned movies for analysis
      const movies = await Movie.findByStatus('owned');

      // Calculate adjusted prices for box sets
      // Group movies by box set
      const boxSetGroups: Record<string, MovieData[]> = {};
      const moviePriceMap = new Map<number, number>(); // Store adjusted price per movie

      movies.forEach((movie: MovieData) => {
        if (movie.has_box_set && movie.box_set_name) {
          const boxSetName = movie.box_set_name as string;
          if (!boxSetGroups[boxSetName]) {
            boxSetGroups[boxSetName] = [];
          }
          boxSetGroups[boxSetName].push(movie);
        }
      });

      // Calculate adjusted prices for box set movies
      Object.entries(boxSetGroups).forEach(([_boxSetName, boxSetMovies]) => {
        if (boxSetMovies.length > 0 && boxSetMovies[0].price && (boxSetMovies[0].price as number) > 0) {
          const boxSetPrice = boxSetMovies[0].price as number;
          const adjustedPrice = boxSetPrice / boxSetMovies.length;
          boxSetMovies.forEach((movie) => {
            moviePriceMap.set(movie.id as number, adjustedPrice);
          });
        }
      });

      // Helper function to get adjusted price
      const getAdjustedPrice = (movie: MovieData): number => {
        if (moviePriceMap.has(movie.id as number)) {
          return moviePriceMap.get(movie.id as number)!;
        }
        return (movie.price as number) || 0;
      };

      // Basic stats
      analytics.totalMovies = movies.length;
      analytics.totalRuntime = movies.reduce((sum: number, m: MovieData) => sum + ((m.runtime as number) || 0), 0);
      analytics.averageRuntime = movies.length > 0 ? Math.round((analytics.totalRuntime as number) / movies.length) : 0;

      // Price analysis with adjusted prices
      const moviesWithPrice = movies.filter((m: MovieData) => getAdjustedPrice(m) > 0);
      analytics.totalSpent = moviesWithPrice.reduce((sum: number, m: MovieData) => sum + getAdjustedPrice(m), 0);
      analytics.averagePrice = moviesWithPrice.length > 0
        ? (analytics.totalSpent as number) / moviesWithPrice.length
        : 0;

      // Price over time (by acquired date) with adjusted prices
      const priceOverTime: Record<string, { count: number; total: number }> = {};
      moviesWithPrice.forEach((movie: MovieData) => {
        if (movie.acquired_date) {
          const date = new Date(movie.acquired_date as string);
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (!priceOverTime[monthYear]) {
            priceOverTime[monthYear] = { count: 0, total: 0 };
          }
          priceOverTime[monthYear].count++;
          priceOverTime[monthYear].total += getAdjustedPrice(movie);
        }
      });

      analytics.priceOverTime = Object.entries(priceOverTime)
        .map(([date, data]) => ({
          period: date,
          totalValue: data.total,
          averagePrice: data.total / data.count,
          count: data.count
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

      // Genre distribution
      const genreCounts: Record<string, number> = {};
      movies.forEach((movie: MovieData) => {
        if (movie.genre) {
          const genres = (movie.genre as string).split(',').map((g: string) => g.trim());
          genres.forEach((genre: string) => {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
          });
        }
      });

      analytics.genreDistribution = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count);

      // Format distribution
      const formatCounts: Record<string, number> = {};
      movies.forEach((movie: MovieData) => {
        if (movie.format) {
          formatCounts[movie.format as string] = (formatCounts[movie.format as string] || 0) + 1;
        }
      });

      analytics.formatDistribution = Object.entries(formatCounts)
        .map(([format, count]) => ({ format, count }))
        .sort((a, b) => b.count - a.count);

      // Director statistics
      const directorCounts: Record<string, number> = {};
      const directorGenres: Record<string, Record<string, number>> = {};
      movies.forEach((movie: MovieData) => {
        if (movie.director) {
          const directors = (movie.director as string).split(',').map((d: string) => d.trim());
          directors.forEach((director: string) => {
            directorCounts[director] = (directorCounts[director] || 0) + 1;

            // Track genres for this director
            if (!directorGenres[director]) {
              directorGenres[director] = {};
            }
            if (movie.genre) {
              const genres = (movie.genre as string).split(',').map((g: string) => g.trim());
              genres.forEach((genre: string) => {
                directorGenres[director][genre] = (directorGenres[director][genre] || 0) + 1;
              });
            }
          });
        }
      });

      analytics.topDirectors = Object.entries(directorCounts)
        .map(([director, count]) => {
          const genres = directorGenres[director];
          const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
          return {
            director,
            count,
            topGenre: topGenre ? topGenre[0] : 'Unknown'
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Actor statistics (using cast data)
      const actorCounts: Record<string, number> = {};
      movies.forEach((movie: MovieData) => {
        if (movie.cast) {
          let cast: Array<string | Record<string, unknown>> = [];
          try {
            cast = typeof movie.cast === 'string' ? JSON.parse(movie.cast) : movie.cast as Array<string | Record<string, unknown>>;
          } catch (e) {
            cast = [];
          }

          if (Array.isArray(cast)) {
            cast.slice(0, 5).forEach((actor: string | Record<string, unknown>) => { // Top 5 billed actors
              const name = (typeof actor === 'object' && actor !== null ? (actor as Record<string, unknown>).name : actor) as string;
              actorCounts[name] = (actorCounts[name] || 0) + 1;
            });
          }
        }
      });

      analytics.topActors = Object.entries(actorCounts)
        .map(([actor, count]) => ({ actor, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      // Release date distribution (by decade)
      const decadeCounts: Record<number, number> = {};
      movies.forEach((movie: MovieData) => {
        if (movie.release_date) {
          const year = new Date(movie.release_date as string).getFullYear();
          const decade = Math.floor(year / 10) * 10;
          decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
        }
      });

      analytics.moviesByDecade = Object.entries(decadeCounts)
        .map(([decade, count]) => ({
          decade: `${decade}s`,
          count
        }))
        .sort((a, b) => a.decade.localeCompare(b.decade));

      // Release date distribution (by year) - last 20 years
      const yearCounts: Record<number, number> = {};
      const currentYear = new Date().getFullYear();
      movies.forEach((movie: MovieData) => {
        if (movie.release_date) {
          const year = new Date(movie.release_date as string).getFullYear();
          if (year >= currentYear - 20) {
            yearCounts[year] = (yearCounts[year] || 0) + 1;
          }
        }
      });

      analytics.moviesByYear = Object.entries(yearCounts)
        .map(([year, count]) => ({ year: parseInt(year), count }))
        .sort((a, b) => a.year - b.year);

      // Rating distribution - separate series for IMDB, TMDB, and Rotten Tomatoes
      const ratingRanges = ['0-2', '2-4', '4-6', '6-7', '7-8', '8-9', '9-10'];

      const imdbRanges: Record<string, number> = { '0-2': 0, '2-4': 0, '4-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };
      const tmdbRanges: Record<string, number> = { '0-2': 0, '2-4': 0, '4-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };
      const rtRanges: Record<string, number> = { '0-2': 0, '2-4': 0, '4-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };

      movies.forEach((movie: MovieData) => {
        // IMDB ratings (already 0-10 scale)
        if (movie.imdb_rating && (movie.imdb_rating as number) > 0) {
          const rating = parseFloat(String(movie.imdb_rating));
          if (rating < 2) imdbRanges['0-2']++;
          else if (rating < 4) imdbRanges['2-4']++;
          else if (rating < 6) imdbRanges['4-6']++;
          else if (rating < 7) imdbRanges['6-7']++;
          else if (rating < 8) imdbRanges['7-8']++;
          else if (rating < 9) imdbRanges['8-9']++;
          else imdbRanges['9-10']++;
        }

        // TMDB ratings (already 0-10 scale)
        if (movie.tmdb_rating && (movie.tmdb_rating as number) > 0) {
          const rating = parseFloat(String(movie.tmdb_rating));
          if (rating < 2) tmdbRanges['0-2']++;
          else if (rating < 4) tmdbRanges['2-4']++;
          else if (rating < 6) tmdbRanges['4-6']++;
          else if (rating < 7) tmdbRanges['6-7']++;
          else if (rating < 8) tmdbRanges['7-8']++;
          else if (rating < 9) tmdbRanges['8-9']++;
          else tmdbRanges['9-10']++;
        }

        // Rotten Tomatoes ratings (convert from percentage to 0-10 scale)
        if (movie.rotten_tomato_rating && (movie.rotten_tomato_rating as number) > 0) {
          const rating = parseFloat(String(movie.rotten_tomato_rating)) / 10; // Convert percentage to 0-10 scale
          if (rating < 2) rtRanges['0-2']++;
          else if (rating < 4) rtRanges['2-4']++;
          else if (rating < 6) rtRanges['4-6']++;
          else if (rating < 7) rtRanges['6-7']++;
          else if (rating < 8) rtRanges['7-8']++;
          else if (rating < 9) rtRanges['8-9']++;
          else rtRanges['9-10']++;
        }
      });

      // Create combined rating distribution data
      analytics.ratingDistribution = ratingRanges.map(range => ({
        rating: range,
        imdb: imdbRanges[range],
        tmdb: tmdbRanges[range],
        rottenTomatoes: rtRanges[range]
      }));

      // Age recommendation distribution
      const ageCounts: Record<string, number> = {};
      movies.forEach((movie: MovieData) => {
        if (movie.recommended_age !== null && movie.recommended_age !== undefined) {
          const ageGroup = movie.recommended_age === 0 ? 'All Ages' : `${movie.recommended_age}+`;
          ageCounts[ageGroup] = (ageCounts[ageGroup] || 0) + 1;
        }
      });

      analytics.ageDistribution = Object.entries(ageCounts)
        .map(([ageRecommendation, count]) => ({ ageRecommendation, count }))
        .sort((a, b) => {
          if (a.ageRecommendation === 'All Ages') return -1;
          if (b.ageRecommendation === 'All Ages') return 1;
          return parseInt(a.ageRecommendation) - parseInt(b.ageRecommendation);
        });

      // Runtime distribution
      const runtimeRanges: Record<string, number> = {
        'Under 90 min': 0,
        '90-120 min': 0,
        '120-150 min': 0,
        '150-180 min': 0,
        'Over 180 min': 0
      };

      movies.forEach((movie: MovieData) => {
        const runtime = movie.runtime as number;
        if (runtime && runtime > 0) {
          if (runtime < 90) runtimeRanges['Under 90 min']++;
          else if (runtime <= 120) runtimeRanges['90-120 min']++;
          else if (runtime <= 150) runtimeRanges['120-150 min']++;
          else if (runtime <= 180) runtimeRanges['150-180 min']++;
          else runtimeRanges['Over 180 min']++;
        }
      });

      analytics.runtimeDistribution = Object.entries(runtimeRanges)
        .map(([runtime, count]) => ({ runtime, count }));

      // Movies acquired over time
      const acquiredCounts: Record<string, number> = {};
      movies.forEach((movie: MovieData) => {
        if (movie.acquired_date) {
          const date = new Date(movie.acquired_date as string);
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          acquiredCounts[monthYear] = (acquiredCounts[monthYear] || 0) + 1;
        }
      });

      analytics.moviesAcquiredOverTime = Object.entries(acquiredCounts)
        .map(([date, count]) => ({ period: date, count }))
        .sort((a, b) => a.period.localeCompare(b.period));


      // Collections by genre -> director
      const collectionsByGenreDirector: Record<string, Record<string, number>> = {};
      movies.forEach((movie: MovieData) => {
        if (movie.genre && movie.director) {
          const genres = (movie.genre as string).split(',').map((g: string) => g.trim());
          const directors = (movie.director as string).split(',').map((d: string) => d.trim());

          genres.forEach((genre: string) => {
            if (!collectionsByGenreDirector[genre]) {
              collectionsByGenreDirector[genre] = {};
            }
            directors.forEach((director: string) => {
              if (!collectionsByGenreDirector[genre][director]) {
                collectionsByGenreDirector[genre][director] = 0;
              }
              collectionsByGenreDirector[genre][director]++;
            });
          });
        }
      });

      // Format as top directors per genre
      analytics.genreDirectorBreakdown = Object.entries(collectionsByGenreDirector)
        .map(([genre, directors]) => ({
          genre,
          directors: Object.entries(directors)
            .map(([director, count]) => ({ director, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
        }))
        .sort((a, b) => {
          const aTotal = a.directors.reduce((sum, d) => sum + d.count, 0);
          const bTotal = b.directors.reduce((sum, d) => sum + d.count, 0);
          return bTotal - aTotal;
        })
        .slice(0, 10);

      // Price percentiles (using adjusted prices)
      const pricesArray = moviesWithPrice
        .map((m: MovieData) => getAdjustedPrice(m))
        .sort((a: number, b: number) => a - b);

      const getPercentile = (arr: number[], percentile: number): number => {
        if (arr.length === 0) return 0;
        const index = Math.ceil((percentile / 100) * arr.length) - 1;
        return arr[Math.max(0, index)];
      };

      analytics.pricePercentiles = {
        p10: getPercentile(pricesArray, 10),
        p25: getPercentile(pricesArray, 25),
        p50: getPercentile(pricesArray, 50), // median
        p75: getPercentile(pricesArray, 75),
        p90: getPercentile(pricesArray, 90),
        p95: getPercentile(pricesArray, 95),
        p99: getPercentile(pricesArray, 99),
        min: pricesArray.length > 0 ? pricesArray[0] : 0,
        max: pricesArray.length > 0 ? pricesArray[pricesArray.length - 1] : 0
      };

      // Price distribution buckets - smaller buckets for better granularity
      const maxPrice = pricesArray.length > 0 ? pricesArray[pricesArray.length - 1] : 100;
      const bucketSize = 1; // CHF 1 buckets
      const numBuckets = Math.ceil(maxPrice / bucketSize);

      const priceBuckets: Record<string, number> = {};
      for (let i = 0; i < numBuckets; i++) {
        const start = i * bucketSize;
        const end = (i + 1) * bucketSize;
        const key = `${start}-${end}`;
        priceBuckets[key] = 0;
      }

      moviesWithPrice.forEach((movie: MovieData) => {
        const price = getAdjustedPrice(movie);
        const bucketIndex = Math.floor(price / bucketSize);
        const start = bucketIndex * bucketSize;
        const end = (bucketIndex + 1) * bucketSize;
        const key = `${start}-${end}`;
        if (priceBuckets[key] !== undefined) {
          priceBuckets[key]++;
        } else {
          priceBuckets[key] = 1;
        }
      });

      analytics.priceDistribution = Object.entries(priceBuckets)
        .map(([range, count]) => ({
          range,
          count,
          rangeStart: parseInt(range.split('-')[0])
        }))
        .sort((a, b) => a.rangeStart - b.rangeStart);

      // Media type distribution (Movies vs TV Shows)
      const mediaTypeCounts: Record<string, number> = {};
      movies.forEach((movie: MovieData) => {
        const mediaType = (movie.media_type as string) || 'movie';
        const displayType = mediaType === 'tv' ? 'TV Show' : 'Movie';
        mediaTypeCounts[displayType] = (mediaTypeCounts[displayType] || 0) + 1;
      });

      analytics.mediaTypeDistribution = Object.entries(mediaTypeCounts)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // Origin/Language distribution
      const languageCounts: Record<string, number> = {};
      const languageNames: Record<string, string> = {
        'en': 'English',
        'fr': 'French',
        'de': 'German',
        'es': 'Spanish',
        'it': 'Italian',
        'ja': 'Japanese',
        'ko': 'Korean',
        'zh': 'Chinese',
        'ru': 'Russian',
        'pt': 'Portuguese',
        'hi': 'Hindi',
        'ar': 'Arabic',
        'sv': 'Swedish',
        'no': 'Norwegian',
        'da': 'Danish',
        'nl': 'Dutch',
        'pl': 'Polish',
        'tr': 'Turkish',
        'th': 'Thai',
        'vi': 'Vietnamese'
      };

      movies.forEach((movie: MovieData) => {
        if (movie.original_language) {
          const lang = (movie.original_language as string).toLowerCase();
          const displayName = languageNames[lang] || lang.toUpperCase();
          languageCounts[displayName] = (languageCounts[displayName] || 0) + 1;
        }
      });

      analytics.originDistribution = Object.entries(languageCounts)
        .map(([origin, count]) => ({ origin, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15); // Top 15 origins

      // Commercial Success Analytics (Budget & Revenue)
      const moviesWithBudgetRevenue = movies.filter((m: MovieData) =>
        m.budget && (m.budget as number) > 0 && m.revenue && (m.revenue as number) > 0
      );

      if (moviesWithBudgetRevenue.length > 0) {
        // Calculate ROI for each movie
        const moviesWithROI = moviesWithBudgetRevenue.map((movie: MovieData) => {
          const profit = (movie.revenue as number) - (movie.budget as number);
          const roi = (profit / (movie.budget as number)) * 100;
          return {
            title: movie.title as string,
            budget: movie.budget as number,
            revenue: movie.revenue as number,
            profit,
            roi: Math.round(roi * 10) / 10, // Round to 1 decimal
            genre: movie.genre ? (movie.genre as string).split(',')[0].trim() : 'Unknown'
          };
        });

        // Top 10 most profitable movies
        analytics.topProfitableMovies = moviesWithROI
          .sort((a, b) => b.profit - a.profit)
          .slice(0, 10)
          .map(m => ({ title: m.title, profit: m.profit, roi: m.roi }));

        // Top 10 highest ROI movies
        analytics.topROIMovies = moviesWithROI
          .sort((a, b) => b.roi - a.roi)
          .slice(0, 10)
          .map(m => ({ title: m.title, roi: m.roi, profit: m.profit }));

        // Overall commercial success stats
        const totalBudget = moviesWithBudgetRevenue.reduce((sum: number, m: MovieData) => sum + (m.budget as number), 0);
        const totalRevenue = moviesWithBudgetRevenue.reduce((sum: number, m: MovieData) => sum + (m.revenue as number), 0);
        const totalProfit = totalRevenue - totalBudget;
        const overallROI = (totalProfit / totalBudget) * 100;

        const profitableMovies = moviesWithROI.filter(m => m.profit > 0);
        const profitabilityRate = (profitableMovies.length / moviesWithROI.length) * 100;

        analytics.commercialSuccess = {
          totalMoviesWithData: moviesWithROI.length,
          totalBudget,
          totalRevenue,
          totalProfit,
          overallROI: Math.round(overallROI * 10) / 10,
          profitableMovies: profitableMovies.length,
          unprofitableMovies: moviesWithROI.length - profitableMovies.length,
          profitabilityRate: Math.round(profitabilityRate * 10) / 10,
          averageROI: Math.round((moviesWithROI.reduce((sum, m) => sum + m.roi, 0) / moviesWithROI.length) * 10) / 10
        };

        // ROI by Genre
        const genreROI: Record<string, { totalROI: number; count: number; totalProfit: number }> = {};
        moviesWithROI.forEach(movie => {
          if (!genreROI[movie.genre]) {
            genreROI[movie.genre] = { totalROI: 0, count: 0, totalProfit: 0 };
          }
          genreROI[movie.genre].totalROI += movie.roi;
          genreROI[movie.genre].count++;
          genreROI[movie.genre].totalProfit += movie.profit;
        });

        analytics.roiByGenre = Object.entries(genreROI)
          .map(([genre, data]) => ({
            genre,
            averageROI: Math.round((data.totalROI / data.count) * 10) / 10,
            count: data.count,
            totalProfit: data.totalProfit
          }))
          .sort((a, b) => b.averageROI - a.averageROI)
          .slice(0, 10);

        // Budget vs Revenue buckets for visualization
        const budgetRevenueBuckets = moviesWithROI.map(m => ({
          title: m.title,
          budget: m.budget / 1000000, // Convert to millions
          revenue: m.revenue / 1000000,
          roi: m.roi
        }));
        analytics.budgetRevenueData = budgetRevenueBuckets;
      } else {
        analytics.commercialSuccess = null;
        analytics.topProfitableMovies = [];
        analytics.topROIMovies = [];
        analytics.roiByGenre = [];
        analytics.budgetRevenueData = [];
      }

      // Most Watched Movies (by watch_count)
      const watchedMovies = movies
        .filter((m: MovieData) => m.watch_count && (m.watch_count as number) > 0)
        .sort((a: MovieData, b: MovieData) => ((b.watch_count as number) || 0) - ((a.watch_count as number) || 0))
        .slice(0, 15)
        .map((m: MovieData) => ({
          id: m.id,
          title: m.title,
          watchCount: m.watch_count,
          lastWatched: m.last_watched,
          rating: (m.imdb_rating as number) || (m.tmdb_rating as number) || 0,
          genre: m.genre ? (m.genre as string).split(',')[0].trim() : 'Unknown'
        }));
      analytics.mostWatchedMovies = watchedMovies;

      // Top Rated Unwatched Movies
      const unwatchedMovies = movies
        .filter((m: MovieData) => (!(m.watch_count as number) || (m.watch_count as number) === 0) && ((m.imdb_rating as number) > 0 || (m.tmdb_rating as number) > 0))
        .map((m: MovieData) => ({
          id: m.id,
          title: m.title,
          imdbRating: (m.imdb_rating as number) || 0,
          tmdbRating: (m.tmdb_rating as number) || 0,
          rating: (m.imdb_rating as number) || (m.tmdb_rating as number) || 0,
          genre: m.genre ? (m.genre as string).split(',')[0].trim() : 'Unknown',
          runtime: (m.runtime as number) || 0
        }))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 15);
      analytics.topRatedUnwatched = unwatchedMovies;

      // Watching stats
      const totalWatched = movies.filter((m: MovieData) => m.watch_count && (m.watch_count as number) > 0).length;
      const totalUnwatched = movies.filter((m: MovieData) => !(m.watch_count as number) || (m.watch_count as number) === 0).length;
      analytics.watchingStats = {
        watched: totalWatched,
        unwatched: totalUnwatched,
        watchedPercent: movies.length > 0 ? Math.round((totalWatched / movies.length) * 100) : 0
      };

      // Last 6 Movies Watched (by last_watched date)
      const lastWatchedMovies = movies
        .filter((m: MovieData) => m.last_watched)
        .sort((a: MovieData, b: MovieData) => new Date(b.last_watched as string).getTime() - new Date(a.last_watched as string).getTime())
        .slice(0, 6)
        .map((m: MovieData) => ({
          id: m.id,
          title: m.title,
          lastWatched: m.last_watched,
          watchCount: (m.watch_count as number) || 1,
          genre: m.genre ? (m.genre as string).split(',')[0].trim() : 'Unknown'
        }));
      analytics.lastWatchedMovies = lastWatchedMovies;

      // Last 6 Movies Added (by acquired_date)
      const recentlyAddedMovies = movies
        .filter((m: MovieData) => m.acquired_date)
        .sort((a: MovieData, b: MovieData) => new Date(b.acquired_date as string).getTime() - new Date(a.acquired_date as string).getTime())
        .slice(0, 6)
        .map((m: MovieData) => ({
          id: m.id,
          title: m.title,
          acquiredDate: m.acquired_date,
          format: (m.format as string) || 'Unknown',
          genre: m.genre ? (m.genre as string).split(',')[0].trim() : 'Unknown'
        }));
      analytics.recentlyAddedMovies = recentlyAddedMovies;

      // Cache the analytics data for 2 hours
      await cacheService.set(cacheKey, { success: true, data: analytics }, 12000);
      logger.info('💾 FILMDEX Analytics cached successfully');

      res.json({ success: true, data: analytics });
    } catch (error) {
      logger.error('Error fetching analytics:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  getMusicAnalytics: async (req: Request, res: Response): Promise<void> => {
    try {
      // Check cache first
      const cacheKey = cacheService.generateCacheKey('music-analytics', {});
      console.log(`🎵 MUSICDEX: Checking cache with key: ${cacheKey}`);
      const cachedAnalytics = await cacheService.get(cacheKey);

      if (cachedAnalytics) {
        logger.info('🎵 MUSICDEX Analytics served from cache (fast)');
        res.json(cachedAnalytics);
        return;
      }

      logger.info('🔄 MUSICDEX Analytics generating fresh data (slow)');
      const db = getDatabase();
      const analytics: AnalyticsData = {};

      // Get all owned albums (exclude wish list)
      const albums = await Album.findByStatus('owned');

      // Get all tracks for overlap analysis (only from owned albums)
      const ownedAlbumIds = albums.map((album: AlbumFormatted) => album.id);
      const tracks = ownedAlbumIds.length > 0
        ? await Track.findByAlbumIds(ownedAlbumIds)
        : [];

      // Debug logging
      logger.info(`Music Analytics: Found ${albums.length} albums and ${tracks.length} tracks`);

      if (albums.length === 0) {
        logger.warn('No albums found in database');
      }

      // Basic stats
      analytics.totalAlbums = albums.length;
      analytics.totalTracks = tracks.length;

      // Calculate actual durations from track data
      const albumDurations: Record<number, number> = {};
      tracks.forEach((track: TrackFormatted) => {
        if (track.durationSec && (track.durationSec as number) > 0) {
          const albumId = track.albumId as number;
          if (!albumDurations[albumId]) {
            albumDurations[albumId] = 0;
          }
          albumDurations[albumId] += track.durationSec as number;
        }
      });

      // Convert seconds to minutes for duration calculations
      const albumDurationsInMinutes: Record<number, number> = {};
      Object.keys(albumDurations).forEach(albumId => {
        albumDurationsInMinutes[parseInt(albumId)] = Math.round(albumDurations[parseInt(albumId)] / 60);
      });

      // Calculate total duration from actual track data
      analytics.totalDuration = Object.values(albumDurationsInMinutes).reduce((sum, duration) => sum + duration, 0);
      analytics.averageDuration = Object.keys(albumDurationsInMinutes).length > 0
        ? Math.round((analytics.totalDuration as number) / Object.keys(albumDurationsInMinutes).length)
        : 0;

      // Calculate estimated listening time (assuming average 3 listens per album)
      analytics.estimatedListeningTime = Math.round((analytics.totalDuration as number) * 3 / 60); // in hours

      // Artist distribution with detailed analysis
      const artistCounts: Record<string, number> = {};
      const artistGenres: Record<string, Record<string, number>> = {};
      const artistDecades: Record<string, Record<number, number>> = {};
      const artistLabels: Record<string, Record<string, number>> = {};

      albums.forEach((album: AlbumFormatted) => {
        if (album.artist && Array.isArray(album.artist)) {
          (album.artist as string[]).forEach((artist: string) => {
            if (artist && typeof artist === 'string' && artist.trim()) {
              artistCounts[artist] = (artistCounts[artist] || 0) + 1;

              // Track genres for this artist
              if (!artistGenres[artist]) artistGenres[artist] = {};
              if (album.genres && Array.isArray(album.genres)) {
                (album.genres as string[]).forEach((genre: string) => {
                  if (genre && genre.trim()) {
                    artistGenres[artist][genre] = (artistGenres[artist][genre] || 0) + 1;
                  }
                });
              }

              // Track decades for this artist
              if (!artistDecades[artist]) artistDecades[artist] = {};
              if (album.releaseYear) {
                const decade = Math.floor((album.releaseYear as number) / 10) * 10;
                artistDecades[artist][decade] = (artistDecades[artist][decade] || 0) + 1;
              }

              // Track labels for this artist
              if (!artistLabels[artist]) artistLabels[artist] = {};
              if (album.labels && Array.isArray(album.labels)) {
                (album.labels as string[]).forEach((label: string) => {
                  if (label && label.trim()) {
                    artistLabels[artist][label] = (artistLabels[artist][label] || 0) + 1;
                  }
                });
              }
            }
          });
        } else if (album.artist && typeof album.artist === 'string' && (album.artist as string).trim()) {
          artistCounts[album.artist as string] = (artistCounts[album.artist as string] || 0) + 1;
        }
      });

      analytics.artistDistribution = Object.entries(artistCounts)
        .map(([artist, count]) => {
          const genres = artistGenres[artist] || {};
          const decades = artistDecades[artist] || {};
          const labels = artistLabels[artist] || {};

          const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
          const topDecade = Object.entries(decades).sort((a, b) => b[1] - a[1])[0];
          const topLabel = Object.entries(labels).sort((a, b) => b[1] - a[1])[0];

          return {
            artist,
            count,
            topGenre: topGenre ? topGenre[0] : 'Unknown',
            topDecade: topDecade ? `${topDecade[0]}s` : 'Unknown',
            topLabel: topLabel ? topLabel[0] : 'Unknown',
            genreCount: Object.keys(genres).length,
            decadeSpan: Object.keys(decades).length
          };
        })
        .sort((a, b) => b.count - a.count);

      // Genre distribution with evolution over time
      const genreCounts: Record<string, number> = {};
      const genreByDecade: Record<string, Record<number, number>> = {};
      const genreByArtist: Record<string, Record<string, number>> = {};

      albums.forEach((album: AlbumFormatted) => {
        if (album.genres && Array.isArray(album.genres)) {
          (album.genres as string[]).forEach((genre: string) => {
            if (genre && typeof genre === 'string' && genre.trim()) {
              genreCounts[genre] = (genreCounts[genre] || 0) + 1;

              // Track genre by decade
              if (!genreByDecade[genre]) genreByDecade[genre] = {};
              if (album.releaseYear) {
                const decade = Math.floor((album.releaseYear as number) / 10) * 10;
                genreByDecade[genre][decade] = (genreByDecade[genre][decade] || 0) + 1;
              }

              // Track genre by artist
              if (!genreByArtist[genre]) genreByArtist[genre] = {};
              if (album.artist && Array.isArray(album.artist)) {
                (album.artist as string[]).forEach((artist: string) => {
                  if (artist && artist.trim()) {
                    genreByArtist[genre][artist] = (genreByArtist[genre][artist] || 0) + 1;
                  }
                });
              }
            }
          });
        } else if (album.genres && typeof album.genres === 'string') {
          const genres = (album.genres as string).split(',').map((g: string) => g.trim());
          genres.forEach((genre: string) => {
            if (genre) {
              genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            }
          });
        }
      });

      analytics.genreDistribution = Object.entries(genreCounts)
        .map(([genre, count]) => {
          const decades = genreByDecade[genre] || {};
          const artists = genreByArtist[genre] || {};

          const topDecade = Object.entries(decades).sort((a, b) => b[1] - a[1])[0];
          const topArtist = Object.entries(artists).sort((a, b) => b[1] - a[1])[0];

          return {
            genre,
            count,
            topDecade: topDecade ? `${topDecade[0]}s` : 'Unknown',
            topArtist: topArtist ? topArtist[0] : 'Unknown',
            artistCount: Object.keys(artists).length,
            decadeSpan: Object.keys(decades).length
          };
        })
        .sort((a, b) => b.count - a.count);

      // Genre evolution over time (last 5 decades)
      const currentYearMusic = new Date().getFullYear();
      const decades: number[] = [];
      for (let year = currentYearMusic - 50; year <= currentYearMusic; year += 10) {
        decades.push(Math.floor(year / 10) * 10);
      }

      analytics.genreEvolution = decades.map(decade => {
        const decadeData: Record<string, unknown> = { decade: `${decade}s` };
        Object.keys(genreByDecade).forEach(genre => {
          decadeData[genre] = genreByDecade[genre][decade] || 0;
        });
        return decadeData;
      });

      // Year/Decade distribution with trends
      const musicYearCounts: Record<number, number> = {};
      const musicDecadeCounts: Record<number, number> = {};
      const yearGenres: Record<number, Record<string, number>> = {};
      const yearArtists: Record<number, Record<string, number>> = {};

      albums.forEach((album: AlbumFormatted) => {
        if (album.releaseYear) {
          const releaseYear = album.releaseYear as number;
          musicYearCounts[releaseYear] = (musicYearCounts[releaseYear] || 0) + 1;
          const decade = Math.floor(releaseYear / 10) * 10;
          musicDecadeCounts[decade] = (musicDecadeCounts[decade] || 0) + 1;

          // Track genres by year
          if (!yearGenres[releaseYear]) yearGenres[releaseYear] = {};
          if (album.genres && Array.isArray(album.genres)) {
            (album.genres as string[]).forEach((genre: string) => {
              if (genre && genre.trim()) {
                yearGenres[releaseYear][genre] = (yearGenres[releaseYear][genre] || 0) + 1;
              }
            });
          }

          // Track artists by year
          if (!yearArtists[releaseYear]) yearArtists[releaseYear] = {};
          if (album.artist && Array.isArray(album.artist)) {
            (album.artist as string[]).forEach((artist: string) => {
              if (artist && artist.trim()) {
                yearArtists[releaseYear][artist] = (yearArtists[releaseYear][artist] || 0) + 1;
              }
            });
          }
        }
      });

      analytics.yearDistribution = Object.entries(musicYearCounts)
        .map(([year, count]) => ({
          year: parseInt(year),
          count,
          topGenre: Object.entries(yearGenres[parseInt(year)] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown',
          topArtist: Object.entries(yearArtists[parseInt(year)] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'
        }))
        .sort((a, b) => a.year - b.year);

      analytics.decadeDistribution = Object.entries(musicDecadeCounts)
        .map(([decade, count]) => ({ decade: `${decade}s`, count }))
        .sort((a, b) => a.decade.localeCompare(b.decade));

      // Label distribution with artist analysis
      const labelCounts: Record<string, number> = {};
      const labelGenres: Record<string, Record<string, number>> = {};
      const labelArtists: Record<string, Record<string, number>> = {};

      albums.forEach((album: AlbumFormatted) => {
        const uniqueLabels = new Set<string>(); // Track unique labels per album

        if (album.labels && Array.isArray(album.labels)) {
          (album.labels as string[]).forEach((label: string) => {
            if (label && typeof label === 'string' && label.trim()) {
              const normalizedLabel = label.trim();
              uniqueLabels.add(normalizedLabel);
            }
          });
        } else if (album.labels && typeof album.labels === 'string') {
          const labels = (album.labels as string).split(',').map((l: string) => l.trim());
          labels.forEach((label: string) => {
            if (label) {
              uniqueLabels.add(label);
            }
          });
        }

        // Only count each unique label once per album
        uniqueLabels.forEach(label => {
          labelCounts[label] = (labelCounts[label] || 0) + 1;

          // Track genres for this label
          if (!labelGenres[label]) labelGenres[label] = {};
          if (album.genres && Array.isArray(album.genres)) {
            (album.genres as string[]).forEach((genre: string) => {
              if (genre && genre.trim()) {
                labelGenres[label][genre] = (labelGenres[label][genre] || 0) + 1;
              }
            });
          }

          // Track artists for this label
          if (!labelArtists[label]) labelArtists[label] = {};
          if (album.artist && Array.isArray(album.artist)) {
            (album.artist as string[]).forEach((artist: string) => {
              if (artist && artist.trim()) {
                labelArtists[label][artist] = (labelArtists[label][artist] || 0) + 1;
              }
            });
          }
        });
      });

      analytics.labelDistribution = Object.entries(labelCounts)
        .map(([label, count]) => {
          const genres = labelGenres[label] || {};
          const artists = labelArtists[label] || {};

          const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
          const topArtist = Object.entries(artists).sort((a, b) => b[1] - a[1])[0];

          return {
            label,
            count,
            topGenre: topGenre ? topGenre[0] : 'Unknown',
            topArtist: topArtist ? topArtist[0] : 'Unknown',
            genreCount: Object.keys(genres).length,
            artistCount: Object.keys(artists).length
          };
        })
        .sort((a, b) => b.count - a.count);

      // Album type distribution with detailed analysis
      const typeCounts: Record<string, number> = {};
      const typeGenres: Record<string, Record<string, number>> = {};
      const typeArtists: Record<string, Record<string, number>> = {};

      albums.forEach((album: AlbumFormatted) => {
        if (album.releaseGroupType && typeof album.releaseGroupType === 'string' && (album.releaseGroupType as string).trim()) {
          const rgt = album.releaseGroupType as string;
          typeCounts[rgt] = (typeCounts[rgt] || 0) + 1;

          // Track genres for this type
          if (!typeGenres[rgt]) typeGenres[rgt] = {};
          if (album.genres && Array.isArray(album.genres)) {
            (album.genres as string[]).forEach((genre: string) => {
              if (genre && genre.trim()) {
                typeGenres[rgt][genre] = (typeGenres[rgt][genre] || 0) + 1;
              }
            });
          }

          // Track artists for this type
          if (!typeArtists[rgt]) typeArtists[rgt] = {};
          if (album.artist && Array.isArray(album.artist)) {
            (album.artist as string[]).forEach((artist: string) => {
              if (artist && artist.trim()) {
                typeArtists[rgt][artist] = (typeArtists[rgt][artist] || 0) + 1;
              }
            });
          }
        }
      });

      analytics.typeDistribution = Object.entries(typeCounts)
        .map(([type, count]) => {
          const genres = typeGenres[type] || {};
          const artists = typeArtists[type] || {};

          const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
          const topArtist = Object.entries(artists).sort((a, b) => b[1] - a[1])[0];

          return {
            type,
            count,
            topGenre: topGenre ? topGenre[0] : 'Unknown',
            topArtist: topArtist ? topArtist[0] : 'Unknown',
            genreCount: Object.keys(genres).length,
            artistCount: Object.keys(artists).length
          };
        })
        .sort((a, b) => b.count - a.count);

      // Recording quality distribution
      const qualityCounts: Record<string, number> = {};
      const qualityGenres: Record<string, Record<string, number>> = {};
      const qualityArtists: Record<string, Record<string, number>> = {};

      albums.forEach((album: AlbumFormatted) => {
        if (album.recordingQuality && (album.recordingQuality as string).trim()) {
          const rq = album.recordingQuality as string;
          qualityCounts[rq] = (qualityCounts[rq] || 0) + 1;

          // Track genres for this quality
          if (!qualityGenres[rq]) qualityGenres[rq] = {};
          if (album.genres && Array.isArray(album.genres)) {
            (album.genres as string[]).forEach((genre: string) => {
              if (genre && genre.trim()) {
                qualityGenres[rq][genre] = (qualityGenres[rq][genre] || 0) + 1;
              }
            });
          }

          // Track artists for this quality
          if (!qualityArtists[rq]) qualityArtists[rq] = {};
          if (album.artist && Array.isArray(album.artist)) {
            (album.artist as string[]).forEach((artist: string) => {
              if (artist && artist.trim()) {
                qualityArtists[rq][artist] = (qualityArtists[rq][artist] || 0) + 1;
              }
            });
          }
        }
      });

      analytics.qualityDistribution = Object.entries(qualityCounts)
        .map(([quality, count]) => {
          const genres = qualityGenres[quality] || {};
          const artists = qualityArtists[quality] || {};

          const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
          const topArtist = Object.entries(artists).sort((a, b) => b[1] - a[1])[0];

          return {
            quality,
            count,
            topGenre: topGenre ? topGenre[0] : 'Unknown',
            topArtist: topArtist ? topArtist[0] : 'Unknown',
            genreCount: Object.keys(genres).length,
            artistCount: Object.keys(artists).length
          };
        })
        .sort((a, b) => b.count - a.count);

      // Release country distribution
      const countryCounts: Record<string, { code: string; name: string; count: number }> = {};
      const countryNames: Record<string, string> = {
        'XE': 'Europe',
        'XW': 'Worldwide',
        'US': 'United States',
        'GB': 'United Kingdom',
        'UK': 'United Kingdom',
        'FR': 'France',
        'DE': 'Germany',
        'JP': 'Japan',
        'AU': 'Australia',
        'CA': 'Canada',
        'NL': 'Netherlands',
        'BE': 'Belgium',
        'CH': 'Switzerland',
        'IT': 'Italy',
        'ES': 'Spain',
        'SE': 'Sweden',
        'NO': 'Norway',
        'DK': 'Denmark',
        'FI': 'Finland',
        'AT': 'Austria',
        'PT': 'Portugal',
        'BR': 'Brazil',
        'MX': 'Mexico',
        'KR': 'South Korea',
        'SG': 'Singapore',
        'NZ': 'New Zealand'
      };

      albums.forEach((album: AlbumFormatted) => {
        if (album.country && (album.country as string).trim()) {
          const countryCode = (album.country as string).trim().toUpperCase();
          if (!countryCounts[countryCode]) {
            countryCounts[countryCode] = {
              code: countryCode,
              name: countryNames[countryCode] || countryCode,
              count: 0
            };
          }
          countryCounts[countryCode].count++;
        }
      });

      analytics.countryDistribution = Object.values(countryCounts)
        .map(({ code, name, count }) => ({ country: name, code, count }))
        .sort((a, b) => b.count - a.count);

      // COMPLETELY RE-IMPLEMENTED: Track overlap analysis
      // Step 1: Build a map of track titles to their album and artist information
      const trackMap: Record<string, { title: string; albums: Set<number>; artists: Set<string>; genres: Set<string>; totalOccurrences: number }> = {};

      tracks.forEach((track: TrackFormatted) => {
        if (track.title && typeof track.title === 'string' && (track.title as string).trim()) {
          const normalizedTitle = (track.title as string).toLowerCase().trim();

          if (!trackMap[normalizedTitle]) {
            trackMap[normalizedTitle] = {
              title: normalizedTitle,
              albums: new Set<number>(),
              artists: new Set<string>(),
              genres: new Set<string>(),
              totalOccurrences: 0
            };
          }

          trackMap[normalizedTitle].albums.add(track.albumId as number);
          trackMap[normalizedTitle].totalOccurrences++;

          // Get album info for artist and genre
          const album = albums.find((a: AlbumFormatted) => a.id === track.albumId);
          if (album) {
            if (album.artist && Array.isArray(album.artist)) {
              (album.artist as string[]).forEach((artist: string) => {
                if (artist && artist.trim()) {
                  trackMap[normalizedTitle].artists.add(artist);
                }
              });
            }
            if (album.genres && Array.isArray(album.genres)) {
              (album.genres as string[]).forEach((genre: string) => {
                if (genre && genre.trim()) {
                  trackMap[normalizedTitle].genres.add(genre);
                }
              });
            }
          }
        }
      });

      // Step 2: Find tracks that actually appear on multiple DIFFERENT albums
      const trulySharedTracks = Object.values(trackMap)
        .filter(track => track.albums.size > 1) // Only tracks on multiple albums
        .map(track => ({
          title: track.title,
          albumCount: track.albums.size,
          albums: Array.from(track.albums),
          artists: Array.from(track.artists),
          genres: Array.from(track.genres),
          totalOccurrences: track.totalOccurrences
        }))
        .sort((a, b) => b.albumCount - a.albumCount);

      analytics.trackOverlap = trulySharedTracks.slice(0, 20);

      // Step 3: Calculate artist overlap statistics correctly
      const artistOverlapStats: Record<string, { overlappingTracks: number; totalOverlapInstances: number; affectedAlbums: Set<number> }> = {};

      // Count total tracks per artist (for context)
      const artistTotalTracks: Record<string, number> = {};
      tracks.forEach((track: TrackFormatted) => {
        const album = albums.find((a: AlbumFormatted) => a.id === track.albumId);
        if (album && album.artist && Array.isArray(album.artist)) {
          (album.artist as string[]).forEach((artist: string) => {
            if (artist && artist.trim()) {
              artistTotalTracks[artist] = (artistTotalTracks[artist] || 0) + 1;
            }
          });
        }
      });

      // Count overlapping tracks per artist
      trulySharedTracks.forEach(track => {
        track.artists.forEach(artist => {
          if (!artistOverlapStats[artist]) {
            artistOverlapStats[artist] = {
              overlappingTracks: 0,
              totalOverlapInstances: 0,
              affectedAlbums: new Set<number>()
            };
          }

          artistOverlapStats[artist].overlappingTracks++;
          artistOverlapStats[artist].totalOverlapInstances += track.totalOccurrences;
          track.albums.forEach(albumId => {
            artistOverlapStats[artist].affectedAlbums.add(albumId);
          });
        });
      });

      // Step 4: Generate final artist overlap data
      analytics.topOverlappingArtists = Object.entries(artistOverlapStats)
        .map(([artist, stats]) => ({
          artist,
          overlappingTracks: stats.overlappingTracks,
          totalOverlapCount: stats.totalOverlapInstances,
          albumCount: stats.affectedAlbums.size,
          totalTracks: artistTotalTracks[artist] || 0,
          totalInstances: stats.totalOverlapInstances,
          avgAlbumsPerTrack: stats.overlappingTracks > 0
            ? Math.round((stats.totalOverlapInstances / stats.overlappingTracks) * 10) / 10
            : 0
        }))
        .sort((a, b) => b.overlappingTracks - a.overlappingTracks)
        .slice(0, 15);

      // Calculate overall overlap statistics
      const albumsWithSharedTracks = new Set<number>();
      trulySharedTracks.forEach(track => {
        track.albums.forEach(albumId => {
          albumsWithSharedTracks.add(albumId);
        });
      });

      analytics.overlapPercentage = albums.length > 0
        ? Math.round((albumsWithSharedTracks.size / albums.length) * 100)
        : 0;

      // Detailed overlap statistics
      analytics.overlapStats = {
        totalSharedTracks: trulySharedTracks.length,
        totalOverlapInstances: trulySharedTracks.reduce((sum, track) => sum + track.totalOccurrences, 0),
        albumsWithOverlap: albumsWithSharedTracks.size,
        averageOverlapPerTrack: trulySharedTracks.length > 0
          ? Math.round((trulySharedTracks.reduce((sum, track) => sum + track.totalOccurrences, 0) / trulySharedTracks.length) * 10) / 10
          : 0,
        mostOverlappedTrack: trulySharedTracks.length > 0 ? trulySharedTracks[0] : null,
        artistsWithOverlap: Object.keys(artistOverlapStats).length
      };

      // Duration statistics with enhanced analysis using actual track durations
      const albumsWithCalculatedDuration = albums
        .filter((album: AlbumFormatted) => albumDurationsInMinutes[album.id as number] && albumDurationsInMinutes[album.id as number] > 0)
        .map((album: AlbumFormatted) => ({
          ...album,
          calculatedDuration: albumDurationsInMinutes[album.id as number]
        }))
        .sort((a, b) => b.calculatedDuration - a.calculatedDuration);

      analytics.longestAlbums = albumsWithCalculatedDuration.slice(0, 10).map(album => ({
        title: (album.title as string) || 'Unknown Title',
        artist: Array.isArray(album.artist) ? (album.artist as string[]).join(', ') : ((album.artist as string) || 'Unknown Artist'),
        duration: album.calculatedDuration,
        genre: Array.isArray(album.genres) ? (album.genres as string[])[0] : 'Unknown',
        year: (album.releaseYear as number) || 'Unknown',
        label: Array.isArray(album.labels) ? (album.labels as string[])[0] : 'Unknown'
      }));

      // Shortest albums
      analytics.shortestAlbums = albumsWithCalculatedDuration.slice(-10).reverse().map(album => ({
        title: (album.title as string) || 'Unknown Title',
        artist: Array.isArray(album.artist) ? (album.artist as string[]).join(', ') : ((album.artist as string) || 'Unknown Artist'),
        duration: album.calculatedDuration,
        genre: Array.isArray(album.genres) ? (album.genres as string[])[0] : 'Unknown',
        year: (album.releaseYear as number) || 'Unknown',
        label: Array.isArray(album.labels) ? (album.labels as string[])[0] : 'Unknown'
      }));

      // Duration distribution using calculated durations
      const durationRanges: Record<string, number> = {
        'Under 30 min': 0,
        '30-45 min': 0,
        '45-60 min': 0,
        '60-75 min': 0,
        '75-90 min': 0,
        'Over 90 min': 0
      };

      albumsWithCalculatedDuration.forEach(album => {
        const duration = album.calculatedDuration;
        if (duration < 30) durationRanges['Under 30 min']++;
        else if (duration < 45) durationRanges['30-45 min']++;
        else if (duration < 60) durationRanges['45-60 min']++;
        else if (duration < 75) durationRanges['60-75 min']++;
        else if (duration < 90) durationRanges['75-90 min']++;
        else durationRanges['Over 90 min']++;
      });

      analytics.durationDistribution = Object.entries(durationRanges)
        .map(([range, count]) => ({ range, count }));

      // Artist collaboration analysis
      const artistCollaborations: Record<string, number> = {};
      albums.forEach((album: AlbumFormatted) => {
        if (album.artist && Array.isArray(album.artist) && (album.artist as string[]).length > 1) {
          const artists = (album.artist as string[]).filter((a: string) => a && a.trim());
          for (let i = 0; i < artists.length; i++) {
            for (let j = i + 1; j < artists.length; j++) {
              const pair = [artists[i], artists[j]].sort().join(' & ');
              artistCollaborations[pair] = (artistCollaborations[pair] || 0) + 1;
            }
          }
        }
      });

      analytics.topCollaborations = Object.entries(artistCollaborations)
        .map(([collaboration, count]) => ({ collaboration, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Genre crossover analysis
      const genreCrossovers: Record<string, number> = {};
      albums.forEach((album: AlbumFormatted) => {
        if (album.genres && Array.isArray(album.genres) && (album.genres as string[]).length > 1) {
          const genres = (album.genres as string[]).filter((g: string) => g && g.trim());
          for (let i = 0; i < genres.length; i++) {
            for (let j = i + 1; j < genres.length; j++) {
              const pair = [genres[i], genres[j]].sort().join(' + ');
              genreCrossovers[pair] = (genreCrossovers[pair] || 0) + 1;
            }
          }
        }
      });

      analytics.topGenreCrossovers = Object.entries(genreCrossovers)
        .map(([crossover, count]) => ({ crossover, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Collection diversity metrics
      const uniqueArtists = new Set<string>();
      const uniqueGenres = new Set<string>();
      const uniqueLabels = new Set<string>();
      const uniqueCountries = new Set<string>();

      albums.forEach((album: AlbumFormatted) => {
        if (album.artist && Array.isArray(album.artist)) {
          (album.artist as string[]).forEach((artist: string) => {
            if (artist && artist.trim()) uniqueArtists.add(artist);
          });
        }
        if (album.genres && Array.isArray(album.genres)) {
          (album.genres as string[]).forEach((genre: string) => {
            if (genre && genre.trim()) uniqueGenres.add(genre);
          });
        }
        if (album.labels && Array.isArray(album.labels)) {
          (album.labels as string[]).forEach((label: string) => {
            if (label && label.trim()) uniqueLabels.add(label);
          });
        }
        if (album.country && (album.country as string).trim()) {
          uniqueCountries.add(album.country as string);
        }
      });

      analytics.diversityMetrics = {
        artistDiversity: uniqueArtists.size,
        genreDiversity: uniqueGenres.size,
        labelDiversity: uniqueLabels.size,
        countryDiversity: uniqueCountries.size,
        averageAlbumsPerArtist: albums.length > 0 ? Math.round((albums.length / uniqueArtists.size) * 10) / 10 : 0,
        averageAlbumsPerGenre: albums.length > 0 ? Math.round((albums.length / uniqueGenres.size) * 10) / 10 : 0
      };

      // Top performing artists by decade
      const artistsByDecade: Record<number, Record<string, number>> = {};
      albums.forEach((album: AlbumFormatted) => {
        if (album.releaseYear && album.artist && Array.isArray(album.artist)) {
          const decade = Math.floor((album.releaseYear as number) / 10) * 10;
          if (!artistsByDecade[decade]) artistsByDecade[decade] = {};

          (album.artist as string[]).forEach((artist: string) => {
            if (artist && artist.trim()) {
              artistsByDecade[decade][artist] = (artistsByDecade[decade][artist] || 0) + 1;
            }
          });
        }
      });

      analytics.topArtistsByDecade = Object.entries(artistsByDecade)
        .map(([decade, artists]) => ({
          decade: `${decade}s`,
          artists: Object.entries(artists)
            .map(([artist, count]) => ({ artist, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
        }))
        .sort((a, b) => a.decade.localeCompare(b.decade));

      // Cache the analytics data for 2 hours
      await cacheService.set(cacheKey, { success: true, data: analytics }, 12000);
      logger.info('💾 MUSICDEX Analytics cached successfully');

      res.json({ success: true, data: analytics });
    } catch (error) {
      logger.error('Error fetching music analytics:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  getBookAnalytics: async (req: Request, res: Response): Promise<void> => {
    try {
      // Check cache first
      const cacheKey = cacheService.generateCacheKey('book-analytics', {});
      console.log(`📚 BOOKDEX: Checking cache with key: ${cacheKey}`);
      const cachedAnalytics = await cacheService.get(cacheKey);

      if (cachedAnalytics) {
        logger.info('📚 BOOKDEX Analytics served from cache (fast)');
        res.json(cachedAnalytics);
        return;
      }

      logger.info('🔄 BOOKDEX Analytics generating fresh data (slow)');
      const db = getDatabase();
      const analytics: AnalyticsData = {};

      // Get all owned books (exclude wish list)
      const books = await Book.findByStatus('owned');

      // Debug logging
      logger.info(`Book Analytics: Found ${books.length} books`);

      if (books.length === 0) {
        logger.warn('No books found in database');
      }

      // Basic stats
      analytics.totalBooks = books.length;

      // Calculate total pages
      const booksWithPages = books.filter((b: BookFormatted) => b.pageCount && (b.pageCount as number) > 0);
      analytics.totalPages = booksWithPages.reduce((sum: number, b: BookFormatted) => sum + ((b.pageCount as number) || 0), 0);
      analytics.averagePages = booksWithPages.length > 0
        ? Math.round((analytics.totalPages as number) / booksWithPages.length)
        : 0;

      // Calculate total runtime for audiobooks
      const audiobooks = books.filter((b: BookFormatted) => b.format === 'audiobook' && b.runtime && (b.runtime as number) > 0);
      analytics.totalAudiobookRuntime = audiobooks.reduce((sum: number, b: BookFormatted) => sum + ((b.runtime as number) || 0), 0);
      analytics.averageAudiobookRuntime = audiobooks.length > 0
        ? Math.round((analytics.totalAudiobookRuntime as number) / audiobooks.length)
        : 0;

      // Author distribution with detailed analysis
      const authorCounts: Record<string, number> = {};
      const authorGenres: Record<string, Record<string, number>> = {};
      const authorDecades: Record<string, Record<number, number>> = {};
      const authorPublishers: Record<string, Record<string, number>> = {};

      books.forEach((book: BookFormatted) => {
        if (book.authors && Array.isArray(book.authors)) {
          (book.authors as string[]).forEach((author: string) => {
            if (author && typeof author === 'string' && author.trim()) {
              authorCounts[author] = (authorCounts[author] || 0) + 1;

              if (!authorGenres[author]) authorGenres[author] = {};
              if (book.genres && Array.isArray(book.genres)) {
                (book.genres as string[]).forEach((genre: string) => {
                  if (genre && genre.trim()) {
                    authorGenres[author][genre] = (authorGenres[author][genre] || 0) + 1;
                  }
                });
              }

              if (!authorDecades[author]) authorDecades[author] = {};
              if (book.publishedYear) {
                const decade = Math.floor((book.publishedYear as number) / 10) * 10;
                authorDecades[author][decade] = (authorDecades[author][decade] || 0) + 1;
              }

              if (!authorPublishers[author]) authorPublishers[author] = {};
              if (book.publisher && (book.publisher as string).trim()) {
                authorPublishers[author][book.publisher as string] = (authorPublishers[author][book.publisher as string] || 0) + 1;
              }
            }
          });
        }
      });

      analytics.authorDistribution = Object.entries(authorCounts)
        .map(([author, count]) => {
          const genres = authorGenres[author] || {};
          const decades = authorDecades[author] || {};
          const publishers = authorPublishers[author] || {};

          const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
          const topDecade = Object.entries(decades).sort((a, b) => b[1] - a[1])[0];
          const topPublisher = Object.entries(publishers).sort((a, b) => b[1] - a[1])[0];

          return {
            author,
            count,
            topGenre: topGenre ? topGenre[0] : 'Unknown',
            topDecade: topDecade ? `${topDecade[0]}s` : 'Unknown',
            topPublisher: topPublisher ? topPublisher[0] : 'Unknown',
            genreCount: Object.keys(genres).length,
            decadeSpan: Object.keys(decades).length
          };
        })
        .sort((a, b) => b.count - a.count);

      // Genre distribution with evolution over time
      const bookGenreCounts: Record<string, number> = {};
      const bookGenreByDecade: Record<string, Record<number, number>> = {};
      const bookGenreByAuthor: Record<string, Record<string, number>> = {};

      books.forEach((book: BookFormatted) => {
        if (book.genres && Array.isArray(book.genres)) {
          (book.genres as string[]).forEach((genre: string) => {
            if (genre && typeof genre === 'string' && genre.trim()) {
              bookGenreCounts[genre] = (bookGenreCounts[genre] || 0) + 1;

              if (!bookGenreByDecade[genre]) bookGenreByDecade[genre] = {};
              if (book.publishedYear) {
                const decade = Math.floor((book.publishedYear as number) / 10) * 10;
                bookGenreByDecade[genre][decade] = (bookGenreByDecade[genre][decade] || 0) + 1;
              }

              if (!bookGenreByAuthor[genre]) bookGenreByAuthor[genre] = {};
              if (book.authors && Array.isArray(book.authors)) {
                (book.authors as string[]).forEach((author: string) => {
                  if (author && author.trim()) {
                    bookGenreByAuthor[genre][author] = (bookGenreByAuthor[genre][author] || 0) + 1;
                  }
                });
              }
            }
          });
        }
      });

      analytics.genreDistribution = Object.entries(bookGenreCounts)
        .map(([genre, count]) => {
          const decades = bookGenreByDecade[genre] || {};
          const authors = bookGenreByAuthor[genre] || {};

          const topDecade = Object.entries(decades).sort((a, b) => b[1] - a[1])[0];
          const topAuthor = Object.entries(authors).sort((a, b) => b[1] - a[1])[0];

          return {
            genre,
            count,
            topDecade: topDecade ? `${topDecade[0]}s` : 'Unknown',
            topAuthor: topAuthor ? topAuthor[0] : 'Unknown',
            authorCount: Object.keys(authors).length,
            decadeSpan: Object.keys(decades).length
          };
        })
        .sort((a, b) => b.count - a.count);

      // Genre evolution over time (last 5 decades)
      const currentYearBook = new Date().getFullYear();
      const bookDecades: number[] = [];
      for (let year = currentYearBook - 50; year <= currentYearBook; year += 10) {
        bookDecades.push(Math.floor(year / 10) * 10);
      }

      analytics.genreEvolution = bookDecades.map(decade => {
        const decadeData: Record<string, unknown> = { decade: `${decade}s` };
        Object.keys(bookGenreByDecade).forEach(genre => {
          decadeData[genre] = bookGenreByDecade[genre][decade] || 0;
        });
        return decadeData;
      });

      // Year/Decade distribution with trends
      const bookYearCounts: Record<number, number> = {};
      const bookDecadeCounts: Record<number, number> = {};
      const bookYearGenres: Record<number, Record<string, number>> = {};
      const bookYearAuthors: Record<number, Record<string, number>> = {};

      books.forEach((book: BookFormatted) => {
        if (book.publishedYear) {
          const py = book.publishedYear as number;
          bookYearCounts[py] = (bookYearCounts[py] || 0) + 1;
          const decade = Math.floor(py / 10) * 10;
          bookDecadeCounts[decade] = (bookDecadeCounts[decade] || 0) + 1;

          if (!bookYearGenres[py]) bookYearGenres[py] = {};
          if (book.genres && Array.isArray(book.genres)) {
            (book.genres as string[]).forEach((genre: string) => {
              if (genre && genre.trim()) {
                bookYearGenres[py][genre] = (bookYearGenres[py][genre] || 0) + 1;
              }
            });
          }

          if (!bookYearAuthors[py]) bookYearAuthors[py] = {};
          if (book.authors && Array.isArray(book.authors)) {
            (book.authors as string[]).forEach((author: string) => {
              if (author && author.trim()) {
                bookYearAuthors[py][author] = (bookYearAuthors[py][author] || 0) + 1;
              }
            });
          }
        }
      });

      analytics.yearDistribution = Object.entries(bookYearCounts)
        .map(([year, count]) => ({
          year: parseInt(year),
          count,
          topGenre: Object.entries(bookYearGenres[parseInt(year)] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown',
          topAuthor: Object.entries(bookYearAuthors[parseInt(year)] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'
        }))
        .sort((a, b) => a.year - b.year);

      analytics.decadeDistribution = Object.entries(bookDecadeCounts)
        .map(([decade, count]) => ({ decade: `${decade}s`, count }))
        .sort((a, b) => a.decade.localeCompare(b.decade));

      // Publisher distribution
      const publisherCounts: Record<string, number> = {};
      const publisherGenres: Record<string, Record<string, number>> = {};
      const publisherAuthors: Record<string, Record<string, number>> = {};

      books.forEach((book: BookFormatted) => {
        if (book.publisher && (book.publisher as string).trim()) {
          const pub = book.publisher as string;
          publisherCounts[pub] = (publisherCounts[pub] || 0) + 1;

          if (!publisherGenres[pub]) publisherGenres[pub] = {};
          if (book.genres && Array.isArray(book.genres)) {
            (book.genres as string[]).forEach((genre: string) => {
              if (genre && genre.trim()) {
                publisherGenres[pub][genre] = (publisherGenres[pub][genre] || 0) + 1;
              }
            });
          }

          if (!publisherAuthors[pub]) publisherAuthors[pub] = {};
          if (book.authors && Array.isArray(book.authors)) {
            (book.authors as string[]).forEach((author: string) => {
              if (author && author.trim()) {
                publisherAuthors[pub][author] = (publisherAuthors[pub][author] || 0) + 1;
              }
            });
          }
        }
      });

      analytics.publisherDistribution = Object.entries(publisherCounts)
        .map(([publisher, count]) => {
          const genres = publisherGenres[publisher] || {};
          const authors = publisherAuthors[publisher] || {};

          const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
          const topAuthor = Object.entries(authors).sort((a, b) => b[1] - a[1])[0];

          return {
            publisher,
            count,
            topGenre: topGenre ? topGenre[0] : 'Unknown',
            topAuthor: topAuthor ? topAuthor[0] : 'Unknown',
            genreCount: Object.keys(genres).length,
            authorCount: Object.keys(authors).length
          };
        })
        .sort((a, b) => b.count - a.count);

      // Format distribution
      const bookFormatCounts: Record<string, number> = {};
      const bookFormatGenres: Record<string, Record<string, number>> = {};
      const bookFormatAuthors: Record<string, Record<string, number>> = {};

      books.forEach((book: BookFormatted) => {
        if (book.format && (book.format as string).trim()) {
          const fmt = book.format as string;
          bookFormatCounts[fmt] = (bookFormatCounts[fmt] || 0) + 1;

          if (!bookFormatGenres[fmt]) bookFormatGenres[fmt] = {};
          if (book.genres && Array.isArray(book.genres)) {
            (book.genres as string[]).forEach((genre: string) => {
              if (genre && genre.trim()) {
                bookFormatGenres[fmt][genre] = (bookFormatGenres[fmt][genre] || 0) + 1;
              }
            });
          }

          if (!bookFormatAuthors[fmt]) bookFormatAuthors[fmt] = {};
          if (book.authors && Array.isArray(book.authors)) {
            (book.authors as string[]).forEach((author: string) => {
              if (author && author.trim()) {
                bookFormatAuthors[fmt][author] = (bookFormatAuthors[fmt][author] || 0) + 1;
              }
            });
          }
        }
      });

      analytics.formatDistribution = Object.entries(bookFormatCounts)
        .map(([format, count]) => {
          const genres = bookFormatGenres[format] || {};
          const authors = bookFormatAuthors[format] || {};

          const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
          const topAuthor = Object.entries(authors).sort((a, b) => b[1] - a[1])[0];

          return {
            format,
            count,
            topGenre: topGenre ? topGenre[0] : 'Unknown',
            topAuthor: topAuthor ? topAuthor[0] : 'Unknown',
            genreCount: Object.keys(genres).length,
            authorCount: Object.keys(authors).length
          };
        })
        .sort((a, b) => b.count - a.count);

      // Language distribution
      const bookLanguageCounts: Record<string, number> = {};
      const bookLanguageNames: Record<string, string> = {
        'en': 'English', 'eng': 'English',
        'fr': 'French', 'fre': 'French', 'fra': 'French',
        'de': 'German', 'ger': 'German', 'deu': 'German',
        'es': 'Spanish', 'spa': 'Spanish',
        'it': 'Italian', 'ita': 'Italian',
        'ja': 'Japanese', 'jpn': 'Japanese',
        'ko': 'Korean', 'kor': 'Korean',
        'zh': 'Chinese', 'chi': 'Chinese', 'zho': 'Chinese',
        'ru': 'Russian', 'rus': 'Russian',
        'pt': 'Portuguese', 'por': 'Portuguese',
        'hi': 'Hindi', 'hin': 'Hindi',
        'ar': 'Arabic', 'ara': 'Arabic',
        'sv': 'Swedish', 'swe': 'Swedish',
        'no': 'Norwegian', 'nor': 'Norwegian',
        'da': 'Danish', 'dan': 'Danish',
        'nl': 'Dutch', 'dut': 'Dutch', 'nld': 'Dutch',
        'pl': 'Polish', 'pol': 'Polish',
        'tr': 'Turkish', 'tur': 'Turkish',
        'th': 'Thai', 'tha': 'Thai',
        'vi': 'Vietnamese', 'vie': 'Vietnamese'
      };

      books.forEach((book: BookFormatted) => {
        if (book.language) {
          const lang = (book.language as string).toLowerCase();
          const displayName = bookLanguageNames[lang] || lang.toUpperCase();
          bookLanguageCounts[displayName] = (bookLanguageCounts[displayName] || 0) + 1;
        }
      });

      analytics.languageDistribution = Object.entries(bookLanguageCounts)
        .map(([language, count]) => ({ language, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Series distribution
      const seriesCounts: Record<string, number> = {};
      const seriesAuthors: Record<string, Record<string, number>> = {};
      const seriesGenres: Record<string, Record<string, number>> = {};

      books.forEach((book: BookFormatted) => {
        if (book.series && (book.series as string).trim()) {
          const ser = book.series as string;
          seriesCounts[ser] = (seriesCounts[ser] || 0) + 1;

          if (!seriesAuthors[ser]) seriesAuthors[ser] = {};
          if (book.authors && Array.isArray(book.authors)) {
            (book.authors as string[]).forEach((author: string) => {
              if (author && author.trim()) {
                seriesAuthors[ser][author] = (seriesAuthors[ser][author] || 0) + 1;
              }
            });
          }

          if (!seriesGenres[ser]) seriesGenres[ser] = {};
          if (book.genres && Array.isArray(book.genres)) {
            (book.genres as string[]).forEach((genre: string) => {
              if (genre && genre.trim()) {
                seriesGenres[ser][genre] = (seriesGenres[ser][genre] || 0) + 1;
              }
            });
          }
        }
      });

      analytics.seriesDistribution = Object.entries(seriesCounts)
        .map(([series, count]) => {
          const authors = seriesAuthors[series] || {};
          const genres = seriesGenres[series] || {};

          const topAuthor = Object.entries(authors).sort((a, b) => b[1] - a[1])[0];
          const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];

          return {
            series,
            count,
            topAuthor: topAuthor ? topAuthor[0] : 'Unknown',
            topGenre: topGenre ? topGenre[0] : 'Unknown',
            authorCount: Object.keys(authors).length,
            genreCount: Object.keys(genres).length
          };
        })
        .sort((a, b) => b.count - a.count);

      // Page count distribution
      const pageRanges: Record<string, number> = {
        'Under 200': 0,
        '200-300': 0,
        '300-400': 0,
        '400-500': 0,
        '500-600': 0,
        'Over 600': 0
      };

      booksWithPages.forEach((book: BookFormatted) => {
        const pages = book.pageCount as number;
        if (pages < 200) pageRanges['Under 200']++;
        else if (pages < 300) pageRanges['200-300']++;
        else if (pages < 400) pageRanges['300-400']++;
        else if (pages < 500) pageRanges['400-500']++;
        else if (pages < 600) pageRanges['500-600']++;
        else pageRanges['Over 600']++;
      });

      analytics.pageCountDistribution = Object.entries(pageRanges)
        .map(([range, count]) => ({ range, count }));

      // Rating distribution
      const bookRatingRanges = ['0-2', '2-4', '4-6', '6-7', '7-8', '8-9', '9-10'];
      const bookRatingCounts: Record<string, number> = { '0-2': 0, '2-4': 0, '4-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };

      books.forEach((book: BookFormatted) => {
        if (book.rating && (book.rating as number) > 0) {
          const rating = parseFloat(String(book.rating));
          if (rating < 2) bookRatingCounts['0-2']++;
          else if (rating < 4) bookRatingCounts['2-4']++;
          else if (rating < 6) bookRatingCounts['4-6']++;
          else if (rating < 7) bookRatingCounts['6-7']++;
          else if (rating < 8) bookRatingCounts['7-8']++;
          else if (rating < 9) bookRatingCounts['8-9']++;
          else bookRatingCounts['9-10']++;
        }
      });

      analytics.ratingDistribution = bookRatingRanges.map(range => ({
        rating: range,
        count: bookRatingCounts[range]
      }));

      // Longest books
      const longestBooks = booksWithPages
        .sort((a: BookFormatted, b: BookFormatted) => ((b.pageCount as number) || 0) - ((a.pageCount as number) || 0))
        .slice(0, 10)
        .map((book: BookFormatted) => ({
          title: (book.title as string) || 'Unknown Title',
          author: Array.isArray(book.authors) ? (book.authors as string[]).join(', ') : ((book.authors as string) || 'Unknown Author'),
          pages: book.pageCount,
          genre: Array.isArray(book.genres) ? (book.genres as string[])[0] : 'Unknown',
          year: (book.publishedYear as number) || 'Unknown',
          publisher: (book.publisher as string) || 'Unknown'
        }));

      analytics.longestBooks = longestBooks;

      // Shortest books
      const shortestBooks = booksWithPages
        .sort((a: BookFormatted, b: BookFormatted) => ((a.pageCount as number) || 0) - ((b.pageCount as number) || 0))
        .slice(0, 10)
        .map((book: BookFormatted) => ({
          title: (book.title as string) || 'Unknown Title',
          author: Array.isArray(book.authors) ? (book.authors as string[]).join(', ') : ((book.authors as string) || 'Unknown Author'),
          pages: book.pageCount,
          genre: Array.isArray(book.genres) ? (book.genres as string[])[0] : 'Unknown',
          year: (book.publishedYear as number) || 'Unknown',
          publisher: (book.publisher as string) || 'Unknown'
        }));

      analytics.shortestBooks = shortestBooks;

      // Author collaboration analysis
      const authorCollaborations: Record<string, number> = {};
      books.forEach((book: BookFormatted) => {
        if (book.authors && Array.isArray(book.authors) && (book.authors as string[]).length > 1) {
          const authors = (book.authors as string[]).filter((a: string) => a && a.trim());
          for (let i = 0; i < authors.length; i++) {
            for (let j = i + 1; j < authors.length; j++) {
              const pair = [authors[i], authors[j]].sort().join(' & ');
              authorCollaborations[pair] = (authorCollaborations[pair] || 0) + 1;
            }
          }
        }
      });

      analytics.topCollaborations = Object.entries(authorCollaborations)
        .map(([collaboration, count]) => ({ collaboration, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Genre crossover analysis
      const bookGenreCrossovers: Record<string, number> = {};
      books.forEach((book: BookFormatted) => {
        if (book.genres && Array.isArray(book.genres) && (book.genres as string[]).length > 1) {
          const genres = (book.genres as string[]).filter((g: string) => g && g.trim());
          for (let i = 0; i < genres.length; i++) {
            for (let j = i + 1; j < genres.length; j++) {
              const pair = [genres[i], genres[j]].sort().join(' + ');
              bookGenreCrossovers[pair] = (bookGenreCrossovers[pair] || 0) + 1;
            }
          }
        }
      });

      analytics.topGenreCrossovers = Object.entries(bookGenreCrossovers)
        .map(([crossover, count]) => ({ crossover, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Collection diversity metrics
      const uniqueBookAuthors = new Set<string>();
      const uniqueBookGenres = new Set<string>();
      const uniquePublishers = new Set<string>();
      const uniqueBookLanguages = new Set<string>();
      const uniqueSeries = new Set<string>();

      books.forEach((book: BookFormatted) => {
        if (book.authors && Array.isArray(book.authors)) {
          (book.authors as string[]).forEach((author: string) => {
            if (author && author.trim()) uniqueBookAuthors.add(author);
          });
        }
        if (book.genres && Array.isArray(book.genres)) {
          (book.genres as string[]).forEach((genre: string) => {
            if (genre && genre.trim()) uniqueBookGenres.add(genre);
          });
        }
        if (book.publisher && (book.publisher as string).trim()) {
          uniquePublishers.add(book.publisher as string);
        }
        if (book.language && (book.language as string).trim()) {
          uniqueBookLanguages.add(book.language as string);
        }
        if (book.series && (book.series as string).trim()) {
          uniqueSeries.add(book.series as string);
        }
      });

      analytics.diversityMetrics = {
        authorDiversity: uniqueBookAuthors.size,
        genreDiversity: uniqueBookGenres.size,
        publisherDiversity: uniquePublishers.size,
        languageDiversity: uniqueBookLanguages.size,
        seriesDiversity: uniqueSeries.size,
        averageBooksPerAuthor: books.length > 0 ? Math.round((books.length / uniqueBookAuthors.size) * 10) / 10 : 0,
        averageBooksPerGenre: books.length > 0 ? Math.round((books.length / uniqueBookGenres.size) * 10) / 10 : 0
      };

      // Reading statistics (books with read_date)
      const readBooks = books.filter((b: BookFormatted) => b.readDate);
      analytics.readBooks = readBooks.length;
      analytics.readPercentage = books.length > 0
        ? Math.round((readBooks.length / books.length) * 100)
        : 0;

      // Books read over time
      const readOverTime: Record<string, number> = {};
      readBooks.forEach((book: BookFormatted) => {
        if (book.readDate) {
          const date = new Date(book.readDate as string);
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          readOverTime[monthYear] = (readOverTime[monthYear] || 0) + 1;
        }
      });

      analytics.booksReadOverTime = Object.entries(readOverTime)
        .map(([date, count]) => ({ period: date, count }))
        .sort((a, b) => a.period.localeCompare(b.period));

      // Top performing authors by decade
      const authorsByDecade: Record<number, Record<string, number>> = {};
      books.forEach((book: BookFormatted) => {
        if (book.publishedYear && book.authors && Array.isArray(book.authors)) {
          const decade = Math.floor((book.publishedYear as number) / 10) * 10;
          if (!authorsByDecade[decade]) authorsByDecade[decade] = {};

          (book.authors as string[]).forEach((author: string) => {
            if (author && author.trim()) {
              authorsByDecade[decade][author] = (authorsByDecade[decade][author] || 0) + 1;
            }
          });
        }
      });

      analytics.topAuthorsByDecade = Object.entries(authorsByDecade)
        .map(([decade, authors]) => ({
          decade: `${decade}s`,
          authors: Object.entries(authors)
            .map(([author, count]) => ({ author, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
        }))
        .sort((a, b) => a.decade.localeCompare(b.decade));

      // Cache the analytics data for 2 hours
      await cacheService.set(cacheKey, { success: true, data: analytics }, 12000);
      logger.info('💾 BOOKDEX Analytics cached successfully');

      res.json({ success: true, data: analytics });
    } catch (error) {
      logger.error('Error fetching book analytics:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  // Cache management endpoints
  invalidateCache: async (req: Request, res: Response): Promise<void> => {
    try {
      await cacheService.invalidateAll();
      res.json({ success: true, message: 'All cache invalidated' });
    } catch (error) {
      logger.error('Error invalidating cache:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  getCacheStats: async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = cacheService.getStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
};

export default analyticsController;
