const Movie = require('../models/movie');
const MovieCast = require('../models/movieCast');
const MovieCrew = require('../models/movieCrew');
const { getDatabase } = require('../database');
const logger = require('../logger');

const analyticsController = {
  getAnalytics: async (req, res) => {
    try {
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

      // Rating distribution
      const ratingRanges = {
        '0-2': 0,
        '2-4': 0,
        '4-6': 0,
        '6-7': 0,
        '7-8': 0,
        '8-9': 0,
        '9-10': 0
      };

      movies.forEach(movie => {
        const rating = movie.imdb_rating || movie.tmdb_rating;
        if (rating && rating > 0) {
          if (rating < 2) ratingRanges['0-2']++;
          else if (rating < 4) ratingRanges['2-4']++;
          else if (rating < 6) ratingRanges['4-6']++;
          else if (rating < 7) ratingRanges['6-7']++;
          else if (rating < 8) ratingRanges['7-8']++;
          else if (rating < 9) ratingRanges['8-9']++;
          else ratingRanges['9-10']++;
        }
      });

      analytics.ratingDistribution = Object.entries(ratingRanges)
        .map(([rating, count]) => ({ rating, count }));

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

      // Runtime distribution
      const runtimeRanges = {
        '0-60': 0,
        '60-90': 0,
        '90-120': 0,
        '120-150': 0,
        '150-180': 0,
        '180+': 0
      };

      movies.forEach(movie => {
        const runtime = movie.runtime;
        if (runtime && runtime > 0) {
          if (runtime < 60) runtimeRanges['0-60']++;
          else if (runtime < 90) runtimeRanges['60-90']++;
          else if (runtime < 120) runtimeRanges['90-120']++;
          else if (runtime < 150) runtimeRanges['120-150']++;
          else if (runtime < 180) runtimeRanges['150-180']++;
          else runtimeRanges['180+']++;
        }
      });

      analytics.runtimeDistribution = Object.entries(runtimeRanges)
        .map(([range, count]) => ({ range, count }));

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

      res.json({ success: true, data: analytics });
    } catch (error) {
      logger.error('Error fetching analytics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = analyticsController;

