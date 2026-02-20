
import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import ImportService from '../services/importService';
import MovieImport from '../models/movieImport';
import tmdbService from '../services/tmdbService';
import UnmatchedMovie from '../models/unmatchedMovie';
import logger from '../logger';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, '/tmp/'); // Temporary directory for uploaded files
  },
  filename: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
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
  uploadCsv: async (req: Request, res: Response): Promise<void> => {
    try {
      // Check for multer errors first
      const file = req.file as Express.Multer.File | undefined;
      if (file === undefined) {
        res.status(400).json({
          error: 'No file provided'
        });
        return;
      }

      // Validate file
      ImportService.validateCsvFile(file);

      // Parse CSV headers only
      const headers = await ImportService.parseCsvHeaders(file.path);

      // Return headers for column mapping
      res.status(200).json({
        headers: headers,
        filePath: file.path
      });
    } catch (error) {
      console.error('CSV upload error:', error);
      res.status(400).json({
        error: (error as Error).message
      });
    }
  },

  // POST /api/import/process - Process CSV with column mapping
  processCsv: async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath, columnMapping } = req.body;

      if (!filePath || !columnMapping) {
        res.status(400).json({
          error: 'File path and column mapping are required'
        });
        return;
      }

      // Create import session
      const importSession = await ImportService.createImportSession();

      // Process CSV file with column mapping asynchronously
      ImportService.processCsvFileWithMapping(filePath, importSession.id, columnMapping)
        .then((result) => {
          logger.debug(`Import ${importSession.id} completed:`, result);
        })
        .catch((error: Error) => {
          console.error(`Import ${importSession.id} failed:`, error);
        });

      // Return import ID immediately
      res.status(202).json({
        importId: importSession.id
      });
    } catch (error) {
      console.error('CSV processing error:', error);
      res.status(400).json({
        error: (error as Error).message
      });
    }
  },

  // GET /api/import/{id} - Get import status
  getImportStatus: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const importStatus = await ImportService.getImportStatus(id as string);

      res.json(importStatus);
    } catch (error) {
      console.error('Get import status error:', error);
      if ((error as Error).message === 'Import not found') {
        res.status(404).json({ error: 'Import not found' });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  },

  // POST /api/import/resolve - Resolve an unmatched movie
  resolveMovie: async (req: Request, res: Response): Promise<void> => {
    try {
      const { importId, unmatchedMovieTitle, resolvedMovie } = req.body;

      if (!importId || !unmatchedMovieTitle || !resolvedMovie) {
        res.status(400).json({
          error: 'Missing required fields: importId, unmatchedMovieTitle, resolvedMovie'
        });
        return;
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
  getMovieSuggestions: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { title, year } = req.query;

      if (!title) {
        res.status(400).json({ error: 'Title parameter is required' });
        return;
      }

      // Search TMDB for suggestions (both movies and TV shows)
      const suggestions = await tmdbService.searchAll(title as string, year as string | undefined);

      // Format suggestions for frontend
      const formattedSuggestions = suggestions.map((item) => ({
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
  ignoreMovie: async (req: Request, res: Response): Promise<void> => {
    try {
      const { importId, movieTitle } = req.body;

      if (!importId || !movieTitle) {
        res.status(400).json({ error: 'Import ID and movie title are required' });
        return;
      }

      // Find and delete the unmatched movie
      const unmatchedMovies = await UnmatchedMovie.findByImportId(importId);
      const unmatchedMovie = unmatchedMovies.find((m) => m.title === movieTitle);

      if (!unmatchedMovie) {
        res.status(404).json({ error: 'Unmatched movie not found' });
        return;
      }

      // Delete the unmatched movie
      await UnmatchedMovie.deleteById(unmatchedMovie.id);

      // Update statistics to reflect ignored movie
      const importSession = await MovieImport.findById(importId);
      if (importSession) {
        const newProcessed = ((importSession.processed_movies as number) || 0) + 1;
        await MovieImport.updateStatistics(
          importId,
          importSession.total_movies,
          newProcessed,
          (importSession.auto_resolved_movies as number) || 0,
          (importSession.manual_resolved_movies as number) || 0
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
// Don't export uploadMiddleware here - create it in index.js with proper config

export { importController, upload };
