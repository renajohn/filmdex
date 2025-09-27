const backfillService = require('../services/backfillService');
const progressTracker = require('../services/progressTracker');
const logger = require('../logger');

const backfillController = {
  // Get backfill status
  getStatus: async (req, res) => {
    try {
      const status = await backfillService.getBackfillStatus();
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Error getting backfill status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get backfill status',
        details: error.message
      });
    }
  },

  // Start backfill process
  startBackfill: async (req, res) => {
    try {
      const { batchSize = 10, delayMs = 1000, force = false } = req.body;
      
      logger.info(`Starting backfill process${force ? ' (force mode)' : ''}...`);
      
      // Start backfill in background
      backfillService.backfillRecommendedAges({
        batchSize,
        delayMs,
        force
      }).then(result => {
        logger.info('Backfill process finished:', result);
      }).catch(error => {
        logger.error('Backfill process failed:', error);
      });
      
      res.json({
        success: true,
        message: 'Backfill process started'
      });
    } catch (error) {
      logger.error('Error starting backfill:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start backfill process',
        details: error.message
      });
    }
  },

  // Get backfill progress
  getProgress: async (req, res) => {
    try {
      const ageBackfillJobs = progressTracker.getJobsByType('ageBackfill');
      
      if (ageBackfillJobs.length === 0) {
        // No active jobs, return completed status
        const status = await backfillService.getBackfillStatus();
        res.json({
          success: true,
          data: {
            status: 'completed',
            ...status
          }
        });
      } else {
        // Return the most recent job
        const latestJob = ageBackfillJobs[ageBackfillJobs.length - 1];
        res.json({
          success: true,
          data: {
            status: latestJob.status,
            processed: latestJob.processed,
            total: latestJob.total,
            updated: latestJob.updated,
            failed: latestJob.failed,
            failedMovies: latestJob.failedItems,
            progress: latestJob.total > 0 ? Math.round((latestJob.processed / latestJob.total) * 100) : 0
          }
        });
      }
    } catch (error) {
      logger.error('Error getting backfill progress:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get backfill progress',
        details: error.message
      });
    }
  },

  // Retry failed movies
  retryFailedMovies: async (req, res) => {
    try {
      const { movieIds } = req.body;
      
      if (!movieIds || !Array.isArray(movieIds)) {
        return res.status(400).json({
          success: false,
          error: 'movieIds array is required'
        });
      }
      
      logger.info(`Retrying ${movieIds.length} failed movies...`);
      
      const result = await backfillService.retryFailedMovies(movieIds, {
        delayMs: 1000,
        onProgress: (progress) => {
          logger.info('Retry progress:', progress);
        },
        onComplete: (result) => {
          logger.info('Retry completed:', result);
        },
        onError: (error) => {
          logger.error('Retry error:', error);
        }
      });
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error retrying failed movies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retry failed movies',
        details: error.message
      });
    }
  }
};

module.exports = backfillController;
