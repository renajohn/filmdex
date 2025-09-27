const Movie = require('../models/movie');
const ageRecommendationService = require('./ageRecommendationService');
const progressTracker = require('./progressTracker');
const logger = require('../logger');

const backfillService = {
  // Backfill recommended ages for all movies
  backfillRecommendedAges: async (options = {}) => {
    const { 
      batchSize = 10, 
      delayMs = 1000,
      force = false
    } = options;

    const jobId = `backfill-${Date.now()}`;
    
    try {
      logger.info('Starting recommended age backfill...');
      
      // Get all movies and TV shows
      const movies = await Movie.findAll();
      const moviesToUpdate = force 
        ? movies // Force mode: process all movies
        : movies.filter(movie => !movie.age_processed); // Normal mode: only unprocessed movies
      
      logger.info(`Found ${moviesToUpdate.length} movies/TV shows to update`);
      
      if (moviesToUpdate.length === 0) {
        const result = { 
          total: 0, 
          updated: 0, 
          failed: 0, 
          failedMovies: [] 
        };
        progressTracker.startJob(jobId, 0, 'ageBackfill');
        progressTracker.completeJob(jobId);
        return result;
      }

      // Start progress tracking
      progressTracker.startJob(jobId, moviesToUpdate.length, 'ageBackfill');
      
      let updated = 0;
      let failed = 0;
      const failedMovies = [];
      
      // Process movies in batches
      for (let i = 0; i < moviesToUpdate.length; i += batchSize) {
        const batch = moviesToUpdate.slice(i, i + batchSize);
        
        // Process batch concurrently
        const batchPromises = batch.map(async (movie) => {
          try {
            let recommendedAge = null;
            
            // Try to get age recommendation
            if (movie.tmdb_id || movie.imdb_id) {
              if (movie.media_type === 'tv') {
                recommendedAge = await ageRecommendationService.getRecommendedAgeForTV(
                  movie.tmdb_id, 
                  movie.imdb_id,
                  { mode: 'median' }
                );
              } else {
                recommendedAge = await ageRecommendationService.getRecommendedAge(
                  movie.tmdb_id, 
                  movie.imdb_id,
                  { mode: 'median' }
                );
              }
            }
            
            // Update movie with recommended age and mark as processed
            await Movie.updateFields(movie.id, { 
              recommended_age: recommendedAge,
              age_processed: true 
            });
            
            logger.info(`Updated age for ${movie.media_type === 'tv' ? 'TV show' : 'movie'}: ${movie.title} (${recommendedAge ? recommendedAge + '+' : 'NR'})`);
            return { success: true, movie, age: recommendedAge };
          } catch (error) {
            logger.error(`Failed to update age for ${movie.media_type === 'tv' ? 'TV show' : 'movie'} ${movie.title}:`, error);
            return { success: false, movie, error: error.message };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Count results
        let batchUpdated = 0;
        let batchFailed = 0;
        batchResults.forEach(result => {
          if (result.success) {
            batchUpdated++;
            updated++;
          } else {
            batchFailed++;
            failed++;
            failedMovies.push({
              id: result.movie.id,
              title: result.movie.title,
              error: result.error
            });
          }
        });
        
        // Update progress
        const processed = Math.min(i + batchSize, moviesToUpdate.length);
        progressTracker.updateProgress(jobId, processed, batchUpdated, batchFailed);
        
        // Delay between batches to avoid rate limiting
        if (i + batchSize < moviesToUpdate.length) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      
      const result = {
        total: moviesToUpdate.length,
        updated,
        failed,
        failedMovies
      };
      
      logger.info('Recommended age backfill completed:', result);
      
      // Mark job as completed
      progressTracker.completeJob(jobId);
      
      return result;
    } catch (error) {
      logger.error('Error during recommended age backfill:', error);
      progressTracker.failJob(jobId, error.message);
      throw error;
    }
  },

  // Get backfill status
  getBackfillStatus: async () => {
    try {
    const movies = await Movie.findAll();
    const totalMovies = movies.length;
    const moviesProcessed = movies.filter(movie => movie.age_processed).length;
    const moviesWithoutAge = totalMovies - moviesProcessed;
      
      return {
        totalMovies,
        moviesWithAge: moviesProcessed,
        moviesWithoutAge,
        completionPercentage: totalMovies > 0 ? Math.round((moviesProcessed / totalMovies) * 100) : 0
      };
    } catch (error) {
      logger.error('Error getting backfill status:', error);
      throw error;
    }
  },

  // Retry failed movies
  retryFailedMovies: async (failedMovieIds, options = {}) => {
    const { 
      delayMs = 1000, 
      onProgress = null,
      onComplete = null,
      onError = null 
    } = options;

    try {
      logger.info(`Retrying ${failedMovieIds.length} failed movies...`);
      
      let updated = 0;
      let failed = 0;
      const failedMovies = [];
      
      for (const movieId of failedMovieIds) {
        try {
          const movie = await Movie.findById(movieId);
          if (!movie) {
            logger.warn(`Movie with ID ${movieId} not found`);
            continue;
          }
          
          let recommendedAge = null;
          
          if (movie.tmdb_id || movie.imdb_id) {
            recommendedAge = await ageRecommendationService.getRecommendedAge(
              movie.tmdb_id, 
              movie.imdb_id,
              { mode: 'median' }
            );
          }
          
          await Movie.updateFields(movie.id, { recommended_age: recommendedAge });
          
          logger.info(`Retry successful for movie: ${movie.title} (${recommendedAge ? recommendedAge + '+' : 'ND'})`);
          updated++;
          
        } catch (error) {
          logger.error(`Retry failed for movie ID ${movieId}:`, error);
          failed++;
          failedMovies.push({
            id: movieId,
            error: error.message
          });
        }
        
        // Report progress
        if (onProgress) {
          onProgress({
            processed: updated + failed,
            total: failedMovieIds.length,
            updated,
            failed
          });
        }
        
        // Delay between requests
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      const result = {
        total: failedMovieIds.length,
        updated,
        failed,
        failedMovies
      };
      
      logger.info('Retry completed:', result);
      
      if (onComplete) {
        onComplete(result);
      }
      
      return result;
    } catch (error) {
      logger.error('Error during retry:', error);
      if (onError) {
        onError(error);
      }
      throw error;
    }
  }
};

module.exports = backfillService;
