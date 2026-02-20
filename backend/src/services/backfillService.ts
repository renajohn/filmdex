import Movie from '../models/movie';
import ageRecommendationService from './ageRecommendationService';
import progressTracker from './progressTracker';
import logger from '../logger';
import type { MovieRow, MovieData } from '../types';

interface BackfillOptions {
  batchSize?: number;
  delayMs?: number;
  force?: boolean;
}

export interface BackfillResult {
  total: number;
  updated: number;
  failed: number;
  failedMovies: Array<{ id: number; title: string; error: string }>;
}

interface BackfillStatus {
  totalMovies: number;
  moviesWithAge: number;
  moviesWithoutAge: number;
  completionPercentage: number;
}

export interface RetryProgress {
  processed: number;
  total: number;
  updated: number;
  failed: number;
}

interface RetryOptions {
  delayMs?: number;
  onProgress?: ((progress: RetryProgress) => void) | null;
  onComplete?: ((result: RetryResult) => void) | null;
  onError?: ((error: Error) => void) | null;
}

export interface RetryResult {
  total: number;
  updated: number;
  failed: number;
  failedMovies: Array<{ id: number; error: string }>;
}

const backfillService = {
  // Backfill recommended ages for all movies
  backfillRecommendedAges: async (options: BackfillOptions = {}): Promise<BackfillResult> => {
    const {
      batchSize = 10,
      delayMs = 1000,
      force = false
    } = options;

    const jobId = `backfill-${Date.now()}`;

    try {
      logger.info('Starting recommended age backfill...');

      // Get all movies and TV shows
      const movies: MovieData[] = await Movie.findAll();
      const moviesToUpdate = force
        ? movies // Force mode: process all movies
        : movies.filter(movie => !movie.age_processed); // Normal mode: only unprocessed movies

      logger.info(`Found ${moviesToUpdate.length} movies/TV shows to update`);

      if (moviesToUpdate.length === 0) {
        const result: BackfillResult = {
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
      const failedMovies: Array<{ id: number; title: string; error: string }> = [];

      // Process movies in batches
      for (let i = 0; i < moviesToUpdate.length; i += batchSize) {
        const batch = moviesToUpdate.slice(i, i + batchSize);

        // Process batch concurrently
        const batchPromises = batch.map(async (movie) => {
          try {
            let recommendedAge: number | null = null;

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
            await Movie.updateFields(movie.id!, {
              recommended_age: recommendedAge,
              age_processed: true
            });

            logger.info(`Updated age for ${movie.media_type === 'tv' ? 'TV show' : 'movie'}: ${movie.title} (${recommendedAge ? recommendedAge + '+' : 'NR'})`);
            return { success: true, movie, age: recommendedAge };
          } catch (error) {
            logger.error(`Failed to update age for ${movie.media_type === 'tv' ? 'TV show' : 'movie'} ${movie.title}:`, error);
            return { success: false, movie, error: error instanceof Error ? error.message : String(error) };
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
              id: result.movie.id!,
              title: result.movie.title as string,
              error: result.error as string
            });
          }
        });

        // Update progress
        const processed = Math.min(i + batchSize, moviesToUpdate.length);
        progressTracker.updateProgress(jobId, processed, batchUpdated, batchFailed);

        // Delay between batches to avoid rate limiting
        if (i + batchSize < moviesToUpdate.length) {
          await new Promise<void>(resolve => setTimeout(resolve, delayMs));
        }
      }

      const result: BackfillResult = {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      progressTracker.failJob(jobId, errorMessage);
      throw error;
    }
  },

  // Get backfill status
  getBackfillStatus: async (): Promise<BackfillStatus> => {
    try {
    const movies: MovieData[] = await Movie.findAll();
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
  retryFailedMovies: async (failedMovieIds: number[], options: RetryOptions = {}): Promise<RetryResult> => {
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
      const failedMovies: Array<{ id: number; error: string }> = [];

      for (const movieId of failedMovieIds) {
        try {
          const movie = await Movie.findById(movieId);
          if (!movie) {
            logger.warn(`Movie with ID ${movieId} not found`);
            continue;
          }

          let recommendedAge: number | null = null;

          if (movie.tmdb_id || movie.imdb_id) {
            recommendedAge = await ageRecommendationService.getRecommendedAge(
              movie.tmdb_id,
              movie.imdb_id,
              { mode: 'median' }
            );
          }

          await Movie.updateFields(movie.id!, { recommended_age: recommendedAge });

          logger.info(`Retry successful for movie: ${movie.title} (${recommendedAge ? recommendedAge + '+' : 'ND'})`);
          updated++;

        } catch (error) {
          logger.error(`Retry failed for movie ID ${movieId}:`, error);
          failed++;
          failedMovies.push({
            id: movieId,
            error: error instanceof Error ? error.message : String(error)
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
        await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      }

      const result: RetryResult = {
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
        onError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }
};

export default backfillService;
