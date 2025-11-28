const Movie = require('../models/movie');
const MovieCast = require('../models/movieCast');
const MovieCrew = require('../models/movieCrew');
const Album = require('../models/album');
const Track = require('../models/track');
const Book = require('../models/book');
const { getDatabase } = require('../database');
const logger = require('../logger');
const cacheService = require('../services/cacheService');

const analyticsController = {
  getAnalytics: async (req, res) => {
    try {
      // Check cache first
      const cacheKey = cacheService.generateCacheKey('analytics', {});
      console.log(`🎬 FILMDEX: Checking cache with key: ${cacheKey}`);
      const cachedAnalytics = await cacheService.get(cacheKey);
      
      if (cachedAnalytics) {
        logger.info('📊 FILMDEX Analytics served from cache (fast)');
        return res.json(cachedAnalytics);
      }

      logger.info('🔄 FILMDEX Analytics generating fresh data (slow)');
      const db = getDatabase();
      const analytics = {};

      // Get all owned movies for analysis
      const movies = await Movie.findByStatus('owned');

      // Calculate adjusted prices for box sets
      // Group movies by box set
      const boxSetGroups = {};
      const moviePriceMap = new Map(); // Store adjusted price per movie
      
      movies.forEach(movie => {
        if (movie.has_box_set && movie.box_set_name) {
          if (!boxSetGroups[movie.box_set_name]) {
            boxSetGroups[movie.box_set_name] = [];
          }
          boxSetGroups[movie.box_set_name].push(movie);
        }
      });

      // Calculate adjusted prices for box set movies
      Object.entries(boxSetGroups).forEach(([boxSetName, boxSetMovies]) => {
        if (boxSetMovies.length > 0 && boxSetMovies[0].price && boxSetMovies[0].price > 0) {
          const boxSetPrice = boxSetMovies[0].price;
          const adjustedPrice = boxSetPrice / boxSetMovies.length;
          boxSetMovies.forEach(movie => {
            moviePriceMap.set(movie.id, adjustedPrice);
          });
        }
      });

      // Helper function to get adjusted price
      const getAdjustedPrice = (movie) => {
        if (moviePriceMap.has(movie.id)) {
          return moviePriceMap.get(movie.id);
        }
        return movie.price || 0;
      };

      // Basic stats
      analytics.totalMovies = movies.length;
      analytics.totalRuntime = movies.reduce((sum, m) => sum + (m.runtime || 0), 0);
      analytics.averageRuntime = movies.length > 0 ? Math.round(analytics.totalRuntime / movies.length) : 0;

      // Price analysis with adjusted prices
      const moviesWithPrice = movies.filter(m => getAdjustedPrice(m) > 0);
      analytics.totalSpent = moviesWithPrice.reduce((sum, m) => sum + getAdjustedPrice(m), 0);
      analytics.averagePrice = moviesWithPrice.length > 0 
        ? analytics.totalSpent / moviesWithPrice.length 
        : 0;

      // Price over time (by acquired date) with adjusted prices
      const priceOverTime = {};
      moviesWithPrice.forEach(movie => {
        if (movie.acquired_date) {
          const date = new Date(movie.acquired_date);
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
      const genreCounts = {};
      movies.forEach(movie => {
        if (movie.genre) {
          const genres = movie.genre.split(',').map(g => g.trim());
          genres.forEach(genre => {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
          });
        }
      });

      analytics.genreDistribution = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count);

      // Format distribution
      const formatCounts = {};
      movies.forEach(movie => {
        if (movie.format) {
          formatCounts[movie.format] = (formatCounts[movie.format] || 0) + 1;
        }
      });

      analytics.formatDistribution = Object.entries(formatCounts)
        .map(([format, count]) => ({ format, count }))
        .sort((a, b) => b.count - a.count);

      // Director statistics
      const directorCounts = {};
      const directorGenres = {};
      movies.forEach(movie => {
        if (movie.director) {
          const directors = movie.director.split(',').map(d => d.trim());
          directors.forEach(director => {
            directorCounts[director] = (directorCounts[director] || 0) + 1;
            
            // Track genres for this director
            if (!directorGenres[director]) {
              directorGenres[director] = {};
            }
            if (movie.genre) {
              const genres = movie.genre.split(',').map(g => g.trim());
              genres.forEach(genre => {
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
      const actorCounts = {};
      movies.forEach(movie => {
        if (movie.cast) {
          let cast = [];
          try {
            cast = typeof movie.cast === 'string' ? JSON.parse(movie.cast) : movie.cast;
          } catch (e) {
            cast = [];
          }
          
          if (Array.isArray(cast)) {
            cast.slice(0, 5).forEach(actor => { // Top 5 billed actors
              const name = actor.name || actor;
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
      const decadeCounts = {};
      movies.forEach(movie => {
        if (movie.release_date) {
          const year = new Date(movie.release_date).getFullYear();
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
      const yearCounts = {};
      const currentYear = new Date().getFullYear();
      movies.forEach(movie => {
        if (movie.release_date) {
          const year = new Date(movie.release_date).getFullYear();
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
      
      const imdbRanges = { '0-2': 0, '2-4': 0, '4-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };
      const tmdbRanges = { '0-2': 0, '2-4': 0, '4-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };
      const rtRanges = { '0-2': 0, '2-4': 0, '4-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };

      movies.forEach(movie => {
        // IMDB ratings (already 0-10 scale)
        if (movie.imdb_rating && movie.imdb_rating > 0) {
          const rating = parseFloat(movie.imdb_rating);
          if (rating < 2) imdbRanges['0-2']++;
          else if (rating < 4) imdbRanges['2-4']++;
          else if (rating < 6) imdbRanges['4-6']++;
          else if (rating < 7) imdbRanges['6-7']++;
          else if (rating < 8) imdbRanges['7-8']++;
          else if (rating < 9) imdbRanges['8-9']++;
          else imdbRanges['9-10']++;
        }

        // TMDB ratings (already 0-10 scale)
        if (movie.tmdb_rating && movie.tmdb_rating > 0) {
          const rating = parseFloat(movie.tmdb_rating);
          if (rating < 2) tmdbRanges['0-2']++;
          else if (rating < 4) tmdbRanges['2-4']++;
          else if (rating < 6) tmdbRanges['4-6']++;
          else if (rating < 7) tmdbRanges['6-7']++;
          else if (rating < 8) tmdbRanges['7-8']++;
          else if (rating < 9) tmdbRanges['8-9']++;
          else tmdbRanges['9-10']++;
        }

        // Rotten Tomatoes ratings (convert from percentage to 0-10 scale)
        if (movie.rotten_tomato_rating && movie.rotten_tomato_rating > 0) {
          const rating = parseFloat(movie.rotten_tomato_rating) / 10; // Convert percentage to 0-10 scale
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
      const ageCounts = {};
      movies.forEach(movie => {
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
      const runtimeRanges = {
        'Under 90 min': 0,
        '90-120 min': 0,
        '120-150 min': 0,
        '150-180 min': 0,
        'Over 180 min': 0
      };

      movies.forEach(movie => {
        const runtime = movie.runtime;
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
      const acquiredCounts = {};
      movies.forEach(movie => {
        if (movie.acquired_date) {
          const date = new Date(movie.acquired_date);
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          acquiredCounts[monthYear] = (acquiredCounts[monthYear] || 0) + 1;
        }
      });

      analytics.moviesAcquiredOverTime = Object.entries(acquiredCounts)
        .map(([date, count]) => ({ period: date, count }))
        .sort((a, b) => a.period.localeCompare(b.period));


      // Collections by genre → director
      const collectionsByGenreDirector = {};
      movies.forEach(movie => {
        if (movie.genre && movie.director) {
          const genres = movie.genre.split(',').map(g => g.trim());
          const directors = movie.director.split(',').map(d => d.trim());
          
          genres.forEach(genre => {
            if (!collectionsByGenreDirector[genre]) {
              collectionsByGenreDirector[genre] = {};
            }
            directors.forEach(director => {
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
        .map(m => getAdjustedPrice(m))
        .sort((a, b) => a - b);
      
      const getPercentile = (arr, percentile) => {
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
      
      const priceBuckets = {};
      for (let i = 0; i < numBuckets; i++) {
        const start = i * bucketSize;
        const end = (i + 1) * bucketSize;
        const key = `${start}-${end}`;
        priceBuckets[key] = 0;
      }

      moviesWithPrice.forEach(movie => {
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
      const mediaTypeCounts = {};
      movies.forEach(movie => {
        const mediaType = movie.media_type || 'movie';
        const displayType = mediaType === 'tv' ? 'TV Show' : 'Movie';
        mediaTypeCounts[displayType] = (mediaTypeCounts[displayType] || 0) + 1;
      });

      analytics.mediaTypeDistribution = Object.entries(mediaTypeCounts)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // Origin/Language distribution
      const languageCounts = {};
      const languageNames = {
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

      movies.forEach(movie => {
        if (movie.original_language) {
          const lang = movie.original_language.toLowerCase();
          const displayName = languageNames[lang] || lang.toUpperCase();
          languageCounts[displayName] = (languageCounts[displayName] || 0) + 1;
        }
      });

      analytics.originDistribution = Object.entries(languageCounts)
        .map(([origin, count]) => ({ origin, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15); // Top 15 origins

      // Commercial Success Analytics (Budget & Revenue)
      const moviesWithBudgetRevenue = movies.filter(m => 
        m.budget && m.budget > 0 && m.revenue && m.revenue > 0
      );

      if (moviesWithBudgetRevenue.length > 0) {
        // Calculate ROI for each movie
        const moviesWithROI = moviesWithBudgetRevenue.map(movie => {
          const profit = movie.revenue - movie.budget;
          const roi = (profit / movie.budget) * 100;
          return {
            title: movie.title,
            budget: movie.budget,
            revenue: movie.revenue,
            profit,
            roi: Math.round(roi * 10) / 10, // Round to 1 decimal
            genre: movie.genre ? movie.genre.split(',')[0].trim() : 'Unknown'
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
        const totalBudget = moviesWithBudgetRevenue.reduce((sum, m) => sum + m.budget, 0);
        const totalRevenue = moviesWithBudgetRevenue.reduce((sum, m) => sum + m.revenue, 0);
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
        const genreROI = {};
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
        .filter(m => m.watch_count && m.watch_count > 0)
        .sort((a, b) => (b.watch_count || 0) - (a.watch_count || 0))
        .slice(0, 15)
        .map(m => ({
          id: m.id,
          title: m.title,
          watchCount: m.watch_count,
          lastWatched: m.last_watched,
          rating: m.imdb_rating || m.tmdb_rating || 0,
          genre: m.genre ? m.genre.split(',')[0].trim() : 'Unknown'
        }));
      analytics.mostWatchedMovies = watchedMovies;

      // Top Rated Unwatched Movies
      const unwatchedMovies = movies
        .filter(m => (!m.watch_count || m.watch_count === 0) && (m.imdb_rating > 0 || m.tmdb_rating > 0))
        .map(m => ({
          id: m.id,
          title: m.title,
          imdbRating: m.imdb_rating || 0,
          tmdbRating: m.tmdb_rating || 0,
          rating: m.imdb_rating || m.tmdb_rating || 0,
          genre: m.genre ? m.genre.split(',')[0].trim() : 'Unknown',
          runtime: m.runtime || 0
        }))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 15);
      analytics.topRatedUnwatched = unwatchedMovies;

      // Watching stats
      const totalWatched = movies.filter(m => m.watch_count && m.watch_count > 0).length;
      const totalUnwatched = movies.filter(m => !m.watch_count || m.watch_count === 0).length;
      analytics.watchingStats = {
        watched: totalWatched,
        unwatched: totalUnwatched,
        watchedPercent: movies.length > 0 ? Math.round((totalWatched / movies.length) * 100) : 0
      };

      // Last 6 Movies Watched (by last_watched date)
      const lastWatchedMovies = movies
        .filter(m => m.last_watched)
        .sort((a, b) => new Date(b.last_watched) - new Date(a.last_watched))
        .slice(0, 6)
        .map(m => ({
          id: m.id,
          title: m.title,
          lastWatched: m.last_watched,
          watchCount: m.watch_count || 1,
          genre: m.genre ? m.genre.split(',')[0].trim() : 'Unknown'
        }));
      analytics.lastWatchedMovies = lastWatchedMovies;

      // Last 6 Movies Added (by acquired_date)
      const recentlyAddedMovies = movies
        .filter(m => m.acquired_date)
        .sort((a, b) => new Date(b.acquired_date) - new Date(a.acquired_date))
        .slice(0, 6)
        .map(m => ({
          id: m.id,
          title: m.title,
          acquiredDate: m.acquired_date,
          format: m.format || 'Unknown',
          genre: m.genre ? m.genre.split(',')[0].trim() : 'Unknown'
        }));
      analytics.recentlyAddedMovies = recentlyAddedMovies;

      // Cache the analytics data for 2 hours
      await cacheService.set(cacheKey, { success: true, data: analytics }, 12000);
      logger.info('💾 FILMDEX Analytics cached successfully');
      
      res.json({ success: true, data: analytics });
    } catch (error) {
      logger.error('Error fetching analytics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getMusicAnalytics: async (req, res) => {
    try {
      // Check cache first
      const cacheKey = cacheService.generateCacheKey('music-analytics', {});
      console.log(`🎵 MUSICDEX: Checking cache with key: ${cacheKey}`);
      const cachedAnalytics = await cacheService.get(cacheKey);
      
      if (cachedAnalytics) {
        logger.info('🎵 MUSICDEX Analytics served from cache (fast)');
        return res.json(cachedAnalytics);
      }

      logger.info('🔄 MUSICDEX Analytics generating fresh data (slow)');
      const db = getDatabase();
      const analytics = {};

      // Get all owned albums (exclude wish list)
      const albums = await Album.findByStatus('owned');
      
      // Get all tracks for overlap analysis (only from owned albums)
      const ownedAlbumIds = albums.map(album => album.id);
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
      const albumDurations = {};
      tracks.forEach(track => {
        if (track.durationSec && track.durationSec > 0) {
          const albumId = track.albumId;
          if (!albumDurations[albumId]) {
            albumDurations[albumId] = 0;
          }
          albumDurations[albumId] += track.durationSec;
        }
      });

      // Convert seconds to minutes for duration calculations
      const albumDurationsInMinutes = {};
      Object.keys(albumDurations).forEach(albumId => {
        albumDurationsInMinutes[albumId] = Math.round(albumDurations[albumId] / 60);
      });

      // Calculate total duration from actual track data
      analytics.totalDuration = Object.values(albumDurationsInMinutes).reduce((sum, duration) => sum + duration, 0);
      analytics.averageDuration = Object.keys(albumDurationsInMinutes).length > 0 
        ? Math.round(analytics.totalDuration / Object.keys(albumDurationsInMinutes).length) 
        : 0;

      // Calculate estimated listening time (assuming average 3 listens per album)
      analytics.estimatedListeningTime = Math.round(analytics.totalDuration * 3 / 60); // in hours

      // Artist distribution with detailed analysis
      const artistCounts = {};
      const artistGenres = {};
      const artistDecades = {};
      const artistLabels = {};
      
      albums.forEach(album => {
        if (album.artist && Array.isArray(album.artist)) {
          album.artist.forEach(artist => {
            if (artist && typeof artist === 'string' && artist.trim()) {
              artistCounts[artist] = (artistCounts[artist] || 0) + 1;
              
              // Track genres for this artist
              if (!artistGenres[artist]) artistGenres[artist] = {};
              if (album.genres && Array.isArray(album.genres)) {
                album.genres.forEach(genre => {
                  if (genre && genre.trim()) {
                    artistGenres[artist][genre] = (artistGenres[artist][genre] || 0) + 1;
                  }
                });
              }
              
              // Track decades for this artist
              if (!artistDecades[artist]) artistDecades[artist] = {};
              if (album.releaseYear) {
                const decade = Math.floor(album.releaseYear / 10) * 10;
                artistDecades[artist][decade] = (artistDecades[artist][decade] || 0) + 1;
              }
              
              // Track labels for this artist
              if (!artistLabels[artist]) artistLabels[artist] = {};
              if (album.labels && Array.isArray(album.labels)) {
                album.labels.forEach(label => {
                  if (label && label.trim()) {
                    artistLabels[artist][label] = (artistLabels[artist][label] || 0) + 1;
                  }
                });
              }
            }
          });
        } else if (album.artist && typeof album.artist === 'string' && album.artist.trim()) {
          artistCounts[album.artist] = (artistCounts[album.artist] || 0) + 1;
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
      const genreCounts = {};
      const genreByDecade = {};
      const genreByArtist = {};
      
      albums.forEach(album => {
        if (album.genres && Array.isArray(album.genres)) {
          album.genres.forEach(genre => {
            if (genre && typeof genre === 'string' && genre.trim()) {
              genreCounts[genre] = (genreCounts[genre] || 0) + 1;
              
              // Track genre by decade
              if (!genreByDecade[genre]) genreByDecade[genre] = {};
              if (album.releaseYear) {
                const decade = Math.floor(album.releaseYear / 10) * 10;
                genreByDecade[genre][decade] = (genreByDecade[genre][decade] || 0) + 1;
              }
              
              // Track genre by artist
              if (!genreByArtist[genre]) genreByArtist[genre] = {};
              if (album.artist && Array.isArray(album.artist)) {
                album.artist.forEach(artist => {
                  if (artist && artist.trim()) {
                    genreByArtist[genre][artist] = (genreByArtist[genre][artist] || 0) + 1;
                  }
                });
              }
            }
          });
        } else if (album.genres && typeof album.genres === 'string') {
          const genres = album.genres.split(',').map(g => g.trim());
          genres.forEach(genre => {
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
      const currentYear = new Date().getFullYear();
      const decades = [];
      for (let year = currentYear - 50; year <= currentYear; year += 10) {
        decades.push(Math.floor(year / 10) * 10); // Ensure we get decade boundaries like 1970, 1980, etc.
      }
      
      analytics.genreEvolution = decades.map(decade => {
        const decadeData = { decade: `${decade}s` };
        Object.keys(genreByDecade).forEach(genre => {
          decadeData[genre] = genreByDecade[genre][decade] || 0;
        });
        return decadeData;
      });

      // Year/Decade distribution with trends
      const yearCounts = {};
      const decadeCounts = {};
      const yearGenres = {};
      const yearArtists = {};
      
      albums.forEach(album => {
        if (album.releaseYear) {
          yearCounts[album.releaseYear] = (yearCounts[album.releaseYear] || 0) + 1;
          const decade = Math.floor(album.releaseYear / 10) * 10;
          decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
          
          // Track genres by year
          if (!yearGenres[album.releaseYear]) yearGenres[album.releaseYear] = {};
          if (album.genres && Array.isArray(album.genres)) {
            album.genres.forEach(genre => {
              if (genre && genre.trim()) {
                yearGenres[album.releaseYear][genre] = (yearGenres[album.releaseYear][genre] || 0) + 1;
              }
            });
          }
          
          // Track artists by year
          if (!yearArtists[album.releaseYear]) yearArtists[album.releaseYear] = {};
          if (album.artist && Array.isArray(album.artist)) {
            album.artist.forEach(artist => {
              if (artist && artist.trim()) {
                yearArtists[album.releaseYear][artist] = (yearArtists[album.releaseYear][artist] || 0) + 1;
              }
            });
          }
        }
      });
      
      analytics.yearDistribution = Object.entries(yearCounts)
        .map(([year, count]) => ({ 
          year: parseInt(year), 
          count,
          topGenre: Object.entries(yearGenres[year] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown',
          topArtist: Object.entries(yearArtists[year] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'
        }))
        .sort((a, b) => a.year - b.year);
      
      analytics.decadeDistribution = Object.entries(decadeCounts)
        .map(([decade, count]) => ({ decade: `${decade}s`, count }))
        .sort((a, b) => a.decade.localeCompare(b.decade));

      // Label distribution with artist analysis
      const labelCounts = {};
      const labelGenres = {};
      const labelArtists = {};
      
      albums.forEach(album => {
        const uniqueLabels = new Set(); // Track unique labels per album
        
        if (album.labels && Array.isArray(album.labels)) {
          album.labels.forEach(label => {
            if (label && typeof label === 'string' && label.trim()) {
              const normalizedLabel = label.trim();
              uniqueLabels.add(normalizedLabel);
            }
          });
        } else if (album.labels && typeof album.labels === 'string') {
          const labels = album.labels.split(',').map(l => l.trim());
          labels.forEach(label => {
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
            album.genres.forEach(genre => {
              if (genre && genre.trim()) {
                labelGenres[label][genre] = (labelGenres[label][genre] || 0) + 1;
              }
            });
          }
          
          // Track artists for this label
          if (!labelArtists[label]) labelArtists[label] = {};
          if (album.artist && Array.isArray(album.artist)) {
            album.artist.forEach(artist => {
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
      const typeCounts = {};
      const typeGenres = {};
      const typeArtists = {};
      
      albums.forEach(album => {
        if (album.releaseGroupType && typeof album.releaseGroupType === 'string' && album.releaseGroupType.trim()) {
          typeCounts[album.releaseGroupType] = (typeCounts[album.releaseGroupType] || 0) + 1;
          
          // Track genres for this type
          if (!typeGenres[album.releaseGroupType]) typeGenres[album.releaseGroupType] = {};
          if (album.genres && Array.isArray(album.genres)) {
            album.genres.forEach(genre => {
              if (genre && genre.trim()) {
                typeGenres[album.releaseGroupType][genre] = (typeGenres[album.releaseGroupType][genre] || 0) + 1;
              }
            });
          }
          
          // Track artists for this type
          if (!typeArtists[album.releaseGroupType]) typeArtists[album.releaseGroupType] = {};
          if (album.artist && Array.isArray(album.artist)) {
            album.artist.forEach(artist => {
              if (artist && artist.trim()) {
                typeArtists[album.releaseGroupType][artist] = (typeArtists[album.releaseGroupType][artist] || 0) + 1;
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
      const qualityCounts = {};
      const qualityGenres = {};
      const qualityArtists = {};
      
      albums.forEach(album => {
        if (album.recordingQuality && album.recordingQuality.trim()) {
          qualityCounts[album.recordingQuality] = (qualityCounts[album.recordingQuality] || 0) + 1;
          
          // Track genres for this quality
          if (!qualityGenres[album.recordingQuality]) qualityGenres[album.recordingQuality] = {};
          if (album.genres && Array.isArray(album.genres)) {
            album.genres.forEach(genre => {
              if (genre && genre.trim()) {
                qualityGenres[album.recordingQuality][genre] = (qualityGenres[album.recordingQuality][genre] || 0) + 1;
              }
            });
          }
          
          // Track artists for this quality
          if (!qualityArtists[album.recordingQuality]) qualityArtists[album.recordingQuality] = {};
          if (album.artist && Array.isArray(album.artist)) {
            album.artist.forEach(artist => {
              if (artist && artist.trim()) {
                qualityArtists[album.recordingQuality][artist] = (qualityArtists[album.recordingQuality][artist] || 0) + 1;
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
      const countryCounts = {};
      const countryNames = {
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
      
      albums.forEach(album => {
        if (album.country && album.country.trim()) {
          const countryCode = album.country.trim().toUpperCase();
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
      const trackMap = {};
      
      tracks.forEach(track => {
        if (track.title && typeof track.title === 'string' && track.title.trim()) {
          const normalizedTitle = track.title.toLowerCase().trim();
          
          if (!trackMap[normalizedTitle]) {
            trackMap[normalizedTitle] = {
              title: normalizedTitle,
              albums: new Set(),
              artists: new Set(),
              genres: new Set(),
              totalOccurrences: 0
            };
          }
          
          trackMap[normalizedTitle].albums.add(track.albumId);
          trackMap[normalizedTitle].totalOccurrences++;
          
          // Get album info for artist and genre
          const album = albums.find(a => a.id === track.albumId);
          if (album) {
            if (album.artist && Array.isArray(album.artist)) {
              album.artist.forEach(artist => {
                if (artist && artist.trim()) {
                  trackMap[normalizedTitle].artists.add(artist);
                }
              });
            }
            if (album.genres && Array.isArray(album.genres)) {
              album.genres.forEach(genre => {
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
      const artistOverlapStats = {};
      
      // Count total tracks per artist (for context)
      const artistTotalTracks = {};
      tracks.forEach(track => {
        const album = albums.find(a => a.id === track.albumId);
        if (album && album.artist && Array.isArray(album.artist)) {
          album.artist.forEach(artist => {
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
              affectedAlbums: new Set()
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
      const albumsWithSharedTracks = new Set();
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
        .filter(album => albumDurationsInMinutes[album.id] && albumDurationsInMinutes[album.id] > 0)
        .map(album => ({
          ...album,
          calculatedDuration: albumDurationsInMinutes[album.id]
        }))
        .sort((a, b) => b.calculatedDuration - a.calculatedDuration);
      
      analytics.longestAlbums = albumsWithCalculatedDuration.slice(0, 10).map(album => ({
        title: album.title || 'Unknown Title',
        artist: Array.isArray(album.artist) ? album.artist.join(', ') : (album.artist || 'Unknown Artist'),
        duration: album.calculatedDuration,
        genre: Array.isArray(album.genres) ? album.genres[0] : 'Unknown',
        year: album.releaseYear || 'Unknown',
        label: Array.isArray(album.labels) ? album.labels[0] : 'Unknown'
      }));

      // Shortest albums
      analytics.shortestAlbums = albumsWithCalculatedDuration.slice(-10).reverse().map(album => ({
        title: album.title || 'Unknown Title',
        artist: Array.isArray(album.artist) ? album.artist.join(', ') : (album.artist || 'Unknown Artist'),
        duration: album.calculatedDuration,
        genre: Array.isArray(album.genres) ? album.genres[0] : 'Unknown',
        year: album.releaseYear || 'Unknown',
        label: Array.isArray(album.labels) ? album.labels[0] : 'Unknown'
      }));

      // Duration distribution using calculated durations
      const durationRanges = {
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
      const artistCollaborations = {};
      albums.forEach(album => {
        if (album.artist && Array.isArray(album.artist) && album.artist.length > 1) {
          const artists = album.artist.filter(a => a && a.trim());
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
      const genreCrossovers = {};
      albums.forEach(album => {
        if (album.genres && Array.isArray(album.genres) && album.genres.length > 1) {
          const genres = album.genres.filter(g => g && g.trim());
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
      const uniqueArtists = new Set();
      const uniqueGenres = new Set();
      const uniqueLabels = new Set();
      const uniqueCountries = new Set();
      
      albums.forEach(album => {
        if (album.artist && Array.isArray(album.artist)) {
          album.artist.forEach(artist => {
            if (artist && artist.trim()) uniqueArtists.add(artist);
          });
        }
        if (album.genres && Array.isArray(album.genres)) {
          album.genres.forEach(genre => {
            if (genre && genre.trim()) uniqueGenres.add(genre);
          });
        }
        if (album.labels && Array.isArray(album.labels)) {
          album.labels.forEach(label => {
            if (label && label.trim()) uniqueLabels.add(label);
          });
        }
        if (album.country && album.country.trim()) {
          uniqueCountries.add(album.country);
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
      const artistsByDecade = {};
      albums.forEach(album => {
        if (album.releaseYear && album.artist && Array.isArray(album.artist)) {
          const decade = Math.floor(album.releaseYear / 10) * 10;
          if (!artistsByDecade[decade]) artistsByDecade[decade] = {};
          
          album.artist.forEach(artist => {
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
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getBookAnalytics: async (req, res) => {
    try {
      // Check cache first
      const cacheKey = cacheService.generateCacheKey('book-analytics', {});
      console.log(`📚 BOOKDEX: Checking cache with key: ${cacheKey}`);
      const cachedAnalytics = await cacheService.get(cacheKey);
      
      if (cachedAnalytics) {
        logger.info('📚 BOOKDEX Analytics served from cache (fast)');
        return res.json(cachedAnalytics);
      }

      logger.info('🔄 BOOKDEX Analytics generating fresh data (slow)');
      const db = getDatabase();
      const analytics = {};

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
      const booksWithPages = books.filter(b => b.pageCount && b.pageCount > 0);
      analytics.totalPages = booksWithPages.reduce((sum, b) => sum + (b.pageCount || 0), 0);
      analytics.averagePages = booksWithPages.length > 0 
        ? Math.round(analytics.totalPages / booksWithPages.length) 
        : 0;

      // Calculate total runtime for audiobooks
      const audiobooks = books.filter(b => b.format === 'audiobook' && b.runtime && b.runtime > 0);
      analytics.totalAudiobookRuntime = audiobooks.reduce((sum, b) => sum + (b.runtime || 0), 0);
      analytics.averageAudiobookRuntime = audiobooks.length > 0 
        ? Math.round(analytics.totalAudiobookRuntime / audiobooks.length) 
        : 0;

      // Author distribution with detailed analysis
      const authorCounts = {};
      const authorGenres = {};
      const authorDecades = {};
      const authorPublishers = {};
      
      books.forEach(book => {
        if (book.authors && Array.isArray(book.authors)) {
          book.authors.forEach(author => {
            if (author && typeof author === 'string' && author.trim()) {
              authorCounts[author] = (authorCounts[author] || 0) + 1;
              
              // Track genres for this author
              if (!authorGenres[author]) authorGenres[author] = {};
              if (book.genres && Array.isArray(book.genres)) {
                book.genres.forEach(genre => {
                  if (genre && genre.trim()) {
                    authorGenres[author][genre] = (authorGenres[author][genre] || 0) + 1;
                  }
                });
              }
              
              // Track decades for this author
              if (!authorDecades[author]) authorDecades[author] = {};
              if (book.publishedYear) {
                const decade = Math.floor(book.publishedYear / 10) * 10;
                authorDecades[author][decade] = (authorDecades[author][decade] || 0) + 1;
              }
              
              // Track publishers for this author
              if (!authorPublishers[author]) authorPublishers[author] = {};
              if (book.publisher && book.publisher.trim()) {
                authorPublishers[author][book.publisher] = (authorPublishers[author][book.publisher] || 0) + 1;
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
      const genreCounts = {};
      const genreByDecade = {};
      const genreByAuthor = {};
      
      books.forEach(book => {
        if (book.genres && Array.isArray(book.genres)) {
          book.genres.forEach(genre => {
            if (genre && typeof genre === 'string' && genre.trim()) {
              genreCounts[genre] = (genreCounts[genre] || 0) + 1;
              
              // Track genre by decade
              if (!genreByDecade[genre]) genreByDecade[genre] = {};
              if (book.publishedYear) {
                const decade = Math.floor(book.publishedYear / 10) * 10;
                genreByDecade[genre][decade] = (genreByDecade[genre][decade] || 0) + 1;
              }
              
              // Track genre by author
              if (!genreByAuthor[genre]) genreByAuthor[genre] = {};
              if (book.authors && Array.isArray(book.authors)) {
                book.authors.forEach(author => {
                  if (author && author.trim()) {
                    genreByAuthor[genre][author] = (genreByAuthor[genre][author] || 0) + 1;
                  }
                });
              }
            }
          });
        }
      });
      
      analytics.genreDistribution = Object.entries(genreCounts)
        .map(([genre, count]) => {
          const decades = genreByDecade[genre] || {};
          const authors = genreByAuthor[genre] || {};
          
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
      const currentYear = new Date().getFullYear();
      const decades = [];
      for (let year = currentYear - 50; year <= currentYear; year += 10) {
        decades.push(Math.floor(year / 10) * 10);
      }
      
      analytics.genreEvolution = decades.map(decade => {
        const decadeData = { decade: `${decade}s` };
        Object.keys(genreByDecade).forEach(genre => {
          decadeData[genre] = genreByDecade[genre][decade] || 0;
        });
        return decadeData;
      });

      // Year/Decade distribution with trends
      const yearCounts = {};
      const decadeCounts = {};
      const yearGenres = {};
      const yearAuthors = {};
      
      books.forEach(book => {
        if (book.publishedYear) {
          yearCounts[book.publishedYear] = (yearCounts[book.publishedYear] || 0) + 1;
          const decade = Math.floor(book.publishedYear / 10) * 10;
          decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
          
          // Track genres by year
          if (!yearGenres[book.publishedYear]) yearGenres[book.publishedYear] = {};
          if (book.genres && Array.isArray(book.genres)) {
            book.genres.forEach(genre => {
              if (genre && genre.trim()) {
                yearGenres[book.publishedYear][genre] = (yearGenres[book.publishedYear][genre] || 0) + 1;
              }
            });
          }
          
          // Track authors by year
          if (!yearAuthors[book.publishedYear]) yearAuthors[book.publishedYear] = {};
          if (book.authors && Array.isArray(book.authors)) {
            book.authors.forEach(author => {
              if (author && author.trim()) {
                yearAuthors[book.publishedYear][author] = (yearAuthors[book.publishedYear][author] || 0) + 1;
              }
            });
          }
        }
      });
      
      analytics.yearDistribution = Object.entries(yearCounts)
        .map(([year, count]) => ({ 
          year: parseInt(year), 
          count,
          topGenre: Object.entries(yearGenres[year] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown',
          topAuthor: Object.entries(yearAuthors[year] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'
        }))
        .sort((a, b) => a.year - b.year);
      
      analytics.decadeDistribution = Object.entries(decadeCounts)
        .map(([decade, count]) => ({ decade: `${decade}s`, count }))
        .sort((a, b) => a.decade.localeCompare(b.decade));

      // Publisher distribution
      const publisherCounts = {};
      const publisherGenres = {};
      const publisherAuthors = {};
      
      books.forEach(book => {
        if (book.publisher && book.publisher.trim()) {
          publisherCounts[book.publisher] = (publisherCounts[book.publisher] || 0) + 1;
          
          // Track genres for this publisher
          if (!publisherGenres[book.publisher]) publisherGenres[book.publisher] = {};
          if (book.genres && Array.isArray(book.genres)) {
            book.genres.forEach(genre => {
              if (genre && genre.trim()) {
                publisherGenres[book.publisher][genre] = (publisherGenres[book.publisher][genre] || 0) + 1;
              }
            });
          }
          
          // Track authors for this publisher
          if (!publisherAuthors[book.publisher]) publisherAuthors[book.publisher] = {};
          if (book.authors && Array.isArray(book.authors)) {
            book.authors.forEach(author => {
              if (author && author.trim()) {
                publisherAuthors[book.publisher][author] = (publisherAuthors[book.publisher][author] || 0) + 1;
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
      const formatCounts = {};
      const formatGenres = {};
      const formatAuthors = {};
      
      books.forEach(book => {
        if (book.format && book.format.trim()) {
          formatCounts[book.format] = (formatCounts[book.format] || 0) + 1;
          
          // Track genres for this format
          if (!formatGenres[book.format]) formatGenres[book.format] = {};
          if (book.genres && Array.isArray(book.genres)) {
            book.genres.forEach(genre => {
              if (genre && genre.trim()) {
                formatGenres[book.format][genre] = (formatGenres[book.format][genre] || 0) + 1;
              }
            });
          }
          
          // Track authors for this format
          if (!formatAuthors[book.format]) formatAuthors[book.format] = {};
          if (book.authors && Array.isArray(book.authors)) {
            book.authors.forEach(author => {
              if (author && author.trim()) {
                formatAuthors[book.format][author] = (formatAuthors[book.format][author] || 0) + 1;
              }
            });
          }
        }
      });
      
      analytics.formatDistribution = Object.entries(formatCounts)
        .map(([format, count]) => {
          const genres = formatGenres[format] || {};
          const authors = formatAuthors[format] || {};
          
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
      const languageCounts = {};
      const languageNames = {
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

      books.forEach(book => {
        if (book.language) {
          const lang = book.language.toLowerCase();
          const displayName = languageNames[lang] || lang.toUpperCase();
          languageCounts[displayName] = (languageCounts[displayName] || 0) + 1;
        }
      });

      analytics.languageDistribution = Object.entries(languageCounts)
        .map(([language, count]) => ({ language, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Series distribution
      const seriesCounts = {};
      const seriesAuthors = {};
      const seriesGenres = {};
      
      books.forEach(book => {
        if (book.series && book.series.trim()) {
          seriesCounts[book.series] = (seriesCounts[book.series] || 0) + 1;
          
          // Track authors for this series
          if (!seriesAuthors[book.series]) seriesAuthors[book.series] = {};
          if (book.authors && Array.isArray(book.authors)) {
            book.authors.forEach(author => {
              if (author && author.trim()) {
                seriesAuthors[book.series][author] = (seriesAuthors[book.series][author] || 0) + 1;
              }
            });
          }
          
          // Track genres for this series
          if (!seriesGenres[book.series]) seriesGenres[book.series] = {};
          if (book.genres && Array.isArray(book.genres)) {
            book.genres.forEach(genre => {
              if (genre && genre.trim()) {
                seriesGenres[book.series][genre] = (seriesGenres[book.series][genre] || 0) + 1;
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
      const pageRanges = {
        'Under 200': 0,
        '200-300': 0,
        '300-400': 0,
        '400-500': 0,
        '500-600': 0,
        'Over 600': 0
      };

      booksWithPages.forEach(book => {
        const pages = book.pageCount;
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
      const ratingRanges = ['0-2', '2-4', '4-6', '6-7', '7-8', '8-9', '9-10'];
      const ratingCounts = { '0-2': 0, '2-4': 0, '4-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };

      books.forEach(book => {
        if (book.rating && book.rating > 0) {
          const rating = parseFloat(book.rating);
          if (rating < 2) ratingCounts['0-2']++;
          else if (rating < 4) ratingCounts['2-4']++;
          else if (rating < 6) ratingCounts['4-6']++;
          else if (rating < 7) ratingCounts['6-7']++;
          else if (rating < 8) ratingCounts['7-8']++;
          else if (rating < 9) ratingCounts['8-9']++;
          else ratingCounts['9-10']++;
        }
      });

      analytics.ratingDistribution = ratingRanges.map(range => ({
        rating: range,
        count: ratingCounts[range]
      }));

      // Longest books
      const longestBooks = booksWithPages
        .sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0))
        .slice(0, 10)
        .map(book => ({
          title: book.title || 'Unknown Title',
          author: Array.isArray(book.authors) ? book.authors.join(', ') : (book.authors || 'Unknown Author'),
          pages: book.pageCount,
          genre: Array.isArray(book.genres) ? book.genres[0] : 'Unknown',
          year: book.publishedYear || 'Unknown',
          publisher: book.publisher || 'Unknown'
        }));

      analytics.longestBooks = longestBooks;

      // Shortest books
      const shortestBooks = booksWithPages
        .sort((a, b) => (a.pageCount || 0) - (b.pageCount || 0))
        .slice(0, 10)
        .map(book => ({
          title: book.title || 'Unknown Title',
          author: Array.isArray(book.authors) ? book.authors.join(', ') : (book.authors || 'Unknown Author'),
          pages: book.pageCount,
          genre: Array.isArray(book.genres) ? book.genres[0] : 'Unknown',
          year: book.publishedYear || 'Unknown',
          publisher: book.publisher || 'Unknown'
        }));

      analytics.shortestBooks = shortestBooks;

      // Author collaboration analysis
      const authorCollaborations = {};
      books.forEach(book => {
        if (book.authors && Array.isArray(book.authors) && book.authors.length > 1) {
          const authors = book.authors.filter(a => a && a.trim());
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
      const genreCrossovers = {};
      books.forEach(book => {
        if (book.genres && Array.isArray(book.genres) && book.genres.length > 1) {
          const genres = book.genres.filter(g => g && g.trim());
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
      const uniqueAuthors = new Set();
      const uniqueGenres = new Set();
      const uniquePublishers = new Set();
      const uniqueLanguages = new Set();
      const uniqueSeries = new Set();
      
      books.forEach(book => {
        if (book.authors && Array.isArray(book.authors)) {
          book.authors.forEach(author => {
            if (author && author.trim()) uniqueAuthors.add(author);
          });
        }
        if (book.genres && Array.isArray(book.genres)) {
          book.genres.forEach(genre => {
            if (genre && genre.trim()) uniqueGenres.add(genre);
          });
        }
        if (book.publisher && book.publisher.trim()) {
          uniquePublishers.add(book.publisher);
        }
        if (book.language && book.language.trim()) {
          uniqueLanguages.add(book.language);
        }
        if (book.series && book.series.trim()) {
          uniqueSeries.add(book.series);
        }
      });

      analytics.diversityMetrics = {
        authorDiversity: uniqueAuthors.size,
        genreDiversity: uniqueGenres.size,
        publisherDiversity: uniquePublishers.size,
        languageDiversity: uniqueLanguages.size,
        seriesDiversity: uniqueSeries.size,
        averageBooksPerAuthor: books.length > 0 ? Math.round((books.length / uniqueAuthors.size) * 10) / 10 : 0,
        averageBooksPerGenre: books.length > 0 ? Math.round((books.length / uniqueGenres.size) * 10) / 10 : 0
      };

      // Reading statistics (books with read_date)
      const readBooks = books.filter(b => b.readDate);
      analytics.readBooks = readBooks.length;
      analytics.readPercentage = books.length > 0 
        ? Math.round((readBooks.length / books.length) * 100) 
        : 0;

      // Books read over time
      const readOverTime = {};
      readBooks.forEach(book => {
        if (book.readDate) {
          const date = new Date(book.readDate);
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          readOverTime[monthYear] = (readOverTime[monthYear] || 0) + 1;
        }
      });

      analytics.booksReadOverTime = Object.entries(readOverTime)
        .map(([date, count]) => ({ period: date, count }))
        .sort((a, b) => a.period.localeCompare(b.period));

      // Top performing authors by decade
      const authorsByDecade = {};
      books.forEach(book => {
        if (book.publishedYear && book.authors && Array.isArray(book.authors)) {
          const decade = Math.floor(book.publishedYear / 10) * 10;
          if (!authorsByDecade[decade]) authorsByDecade[decade] = {};
          
          book.authors.forEach(author => {
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
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Cache management endpoints
  invalidateCache: async (req, res) => {
    try {
      await cacheService.invalidateAll();
      res.json({ success: true, message: 'All cache invalidated' });
    } catch (error) {
      logger.error('Error invalidating cache:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getCacheStats: async (req, res) => {
    try {
      const stats = cacheService.getStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = analyticsController;

