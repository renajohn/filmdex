const multer = require('multer');
const path = require('path');
const ImportService = require('../services/importService');
const MovieImport = require('../models/movieImport');
const tmdbService = require('../services/tmdbService');
const UnmatchedMovie = require('../models/unmatchedMovie');
const logger = require('../logger');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/tmp/'); // Temporary directory for uploaded files
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `csv-import-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: ImportService.getMaxFileSize()
  }
});

const importController = {
  // POST /api/import/csv - Upload CSV file for import
  uploadCsv: async (req, res) => {
    try {
      // Check for multer errors first
      if (req.file === undefined) {
        return res.status(400).json({
          error: 'No file provided'
        });
      }

      // Validate file
      ImportService.validateCsvFile(req.file);
      
      // Parse CSV headers only
      const headers = await ImportService.parseCsvHeaders(req.file.path);
      
      // Return headers for column mapping
      res.status(200).json({
        headers: headers,
        filePath: req.file.path
      });
    } catch (error) {
      console.error('CSV upload error:', error);
      res.status(400).json({
        error: error.message
      });
    }
  },

  // POST /api/import/process - Process CSV with column mapping
  processCsv: async (req, res) => {
    try {
      const { filePath, columnMapping } = req.body;
      
      if (!filePath || !columnMapping) {
        return res.status(400).json({
          error: 'File path and column mapping are required'
        });
      }

      // Create import session
      const importSession = await ImportService.createImportSession();
      
      // Process CSV file with column mapping asynchronously
      ImportService.processCsvFileWithMapping(filePath, importSession.id, columnMapping)
        .then(result => {
          logger.debug(`Import ${importSession.id} completed:`, result);
        })
        .catch(error => {
          console.error(`Import ${importSession.id} failed:`, error);
        });

      // Return import ID immediately
      res.status(202).json({
        importId: importSession.id
      });
    } catch (error) {
      console.error('CSV processing error:', error);
      res.status(400).json({
        error: error.message
      });
    }
  },

  // GET /api/import/{id} - Get import status
  getImportStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const importStatus = await ImportService.getImportStatus(id);
      
      res.json(importStatus);
    } catch (error) {
      console.error('Get import status error:', error);
      if (error.message === 'Import not found') {
        res.status(404).json({ error: 'Import not found' });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  },

  // POST /api/import/resolve - Resolve an unmatched movie
  resolveMovie: async (req, res) => {
    try {
      const { importId, unmatchedMovieTitle, resolvedMovie } = req.body;
      
      if (!importId || !unmatchedMovieTitle || !resolvedMovie) {
        return res.status(400).json({
          error: 'Missing required fields: importId, unmatchedMovieTitle, resolvedMovie'
        });
      }

      const createdMovie = await ImportService.resolveMovie(importId, unmatchedMovieTitle, resolvedMovie);
      
      res.json({
        success: true,
        movie: createdMovie
      });
    } catch (error) {
      console.error('Resolve movie error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // GET /api/import/{id}/suggestions - Get movie suggestions for unmatched movie
  getMovieSuggestions: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, year } = req.query;
      
      if (!title) {
        return res.status(400).json({ error: 'Title parameter is required' });
      }

      // Search TMDB for suggestions (both movies and TV shows)
      const suggestions = await tmdbService.searchAll(title, year);
      
      // Format suggestions for frontend
      const formattedSuggestions = suggestions.map(item => ({
        id: item.id,
        title: item.title,
        originalTitle: item.original_title,
        releaseDate: item.release_date,
        posterPath: item.poster_path,
        overview: item.overview,
        voteAverage: item.vote_average,
        mediaType: item.media_type
      }));

      res.json({
        suggestions: formattedSuggestions
      });
    } catch (error) {
      console.error('Get suggestions error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Ignore an unmatched movie
  ignoreMovie: async (req, res) => {
    try {
      const { importId, movieTitle } = req.body;

      if (!importId || !movieTitle) {
        return res.status(400).json({ error: 'Import ID and movie title are required' });
      }

      // Find and delete the unmatched movie
      const unmatchedMovies = await UnmatchedMovie.findByImportId(importId);
      const unmatchedMovie = unmatchedMovies.find(m => m.title === movieTitle);
      
      if (!unmatchedMovie) {
        return res.status(404).json({ error: 'Unmatched movie not found' });
      }

      // Delete the unmatched movie
      await UnmatchedMovie.deleteById(unmatchedMovie.id);

      // Update statistics to reflect ignored movie
      const importSession = await MovieImport.findById(importId);
      if (importSession) {
        const newProcessed = (importSession.processed_movies || 0) + 1;
        await MovieImport.updateStatistics(
          importId, 
          importSession.total_movies, 
          newProcessed, 
          importSession.auto_resolved_movies || 0, 
          importSession.manual_resolved_movies || 0
        );
        logger.debug(`Updated statistics after ignoring: processed=${newProcessed}`);
      }

      res.json({ success: true, message: 'Movie ignored successfully' });
    } catch (error) {
      console.error('Error ignoring movie:', error);
      res.status(500).json({ error: 'Failed to ignore movie' });
    }
  }
};

// Middleware for file upload
const uploadMiddleware = upload.single('file');

module.exports = {
  importController,
  uploadMiddleware
};
