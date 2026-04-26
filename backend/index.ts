import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import configManager from './src/config';
import logger from './src/logger';
import movieController from './src/controllers/movieController';
import { importController, upload } from './src/controllers/importController';
import analyticsController from './src/controllers/analyticsController';
import musicController from './src/controllers/musicController';
import musicService from './src/services/musicService';
import bookController from './src/controllers/bookController';
import bookService from './src/services/bookService';
import backupController from './src/controllers/backupController';
import bookCommentController from './src/controllers/bookCommentController';
import { mountMcp } from './src/mcp/mount';
import Movie from './src/models/movie';
import MovieImport from './src/models/movieImport';
import MovieCast from './src/models/movieCast';
import MovieCrew from './src/models/movieCrew';
import Collection from './src/models/collection';
import MovieCollection from './src/models/movieCollection';
import { initDatabase } from './src/database';
import imageService from './src/services/imageService';

// Parse command line arguments
const args = process.argv.slice(2);
const deploymentFile = args.find(arg => arg.startsWith('--deployment='))?.split('=')[1] ||
                      args.find(arg => arg.startsWith('-d='))?.split('=')[1];

// Load configuration
try {
  configManager.loadDeploymentConfig(deploymentFile);
  configManager.loadDataConfig();
} catch (error) {
  logger.error('Configuration loading failed:', (error as Error).message);
  logger.info('Usage: node index.js [--deployment=path/to/deployment.json]');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.static('public'));

// Apply multer middleware specifically for file upload routes BEFORE JSON parsing
// Create upload middleware after config is loaded
let csvUploadMiddleware: ReturnType<typeof upload.single> | undefined;
let moviePosterUploadMiddleware: ReturnType<typeof upload.single> | undefined;
let backupUploadMiddleware: ReturnType<typeof upload.single> | undefined;

// We'll set up the upload middleware after config is loaded, in the startServer function
app.post('/api/import/csv', (req: Request, res: Response, next: NextFunction) => {
  if (!csvUploadMiddleware) {
    return next(new Error('Upload middleware not initialized'));
  }
  csvUploadMiddleware(req, res, next);
}, importController.uploadCsv);
app.post('/api/movies/:id/upload-poster', movieController.posterUploadMiddleware, movieController.uploadCustomPoster);
app.post('/api/backup/upload-restore', (req: Request, res: Response, next: NextFunction) => {
  if (!backupUploadMiddleware) {
    return next(new Error('Upload middleware not initialized'));
  }
  backupUploadMiddleware(req, res, next);
}, backupController.uploadAndRestoreBackup);

// JSON parsing middleware for all other routes (with increased limit for cover art)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// MCP server: mount before static and after JSON parsing.
// The streamable HTTP transport reads req.body (already parsed by express.json).
mountMcp(app, '/mcp');

// Initialize database
const startServer = async (): Promise<void> => {
  try {
    await initDatabase();

    // Initialize services with configuration
    await imageService.init();

    // Initialize ebooks directory
    try {
      const ebooksDir = configManager.getEbooksPath();
      if (!fs.existsSync(ebooksDir)) {
        fs.mkdirSync(ebooksDir, { recursive: true });
        logger.info(`Created ebooks directory: ${ebooksDir}`);
      }
    } catch (error) {
      logger.warn('Failed to initialize ebooks directory:', (error as Error).message);
      // Don't block initialization if ebooks directory creation fails
    }

    // Initialize music tables
    await musicService.initializeTables();

    // Note: Book tables are initialized in database.js during initDatabase()

    logger.info('Database initialized successfully');
    logger.info(`Using database: ${configManager.getDatabasePath()}`);
    logger.info(`Using images directory: ${configManager.getImagesPath()}`);
    logger.info(`Using ebooks directory: ${configManager.getEbooksPath()}`);

    // Initialize upload middleware with proper config
    // CSV upload middleware
    csvUploadMiddleware = upload.single('file');

    // Movie poster upload middleware - same config as CSV
    moviePosterUploadMiddleware = upload.single('file');

    // Backup upload middleware - same config as CSV
    backupUploadMiddleware = upload.single('file');

    // Update the route handlers with the newly created middleware
    app.post('/api/import/csv', csvUploadMiddleware, importController.uploadCsv);
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    process.exit(1);
  }
};

// API Routes (all under /api prefix)
app.get('/api/movies', movieController.getAllMovies);
app.get('/api/movies/search', movieController.searchMovies);
app.get('/api/movies/search/tmdb', movieController.searchMoviesTMDB);
app.get('/api/movies/search/all', movieController.searchAllTMDB);
app.get('/api/tmdb/genres', movieController.getTMDBGenres);
app.get('/api/tmdb/movie/:id', movieController.getMovieDetailsTMDB);
app.get('/api/tmdb/tv/:id', movieController.getTVShowDetailsTMDB);
app.get('/api/omdb/search', movieController.searchOMDB);
app.get('/api/movies/autocomplete', movieController.getAutocompleteSuggestions);
app.get('/api/movies/formats', movieController.getFormats);
app.get('/api/movies/collections', movieController.getCollectionNames);
app.get('/api/debug/collections', movieController.debugCollections);
app.post('/api/fix/box-set-types', movieController.fixBoxSetTypes);
app.get('/api/movies/collections/movies', movieController.getMoviesByCollection);

// Collection routes
app.get('/api/collections', movieController.getAllCollections);
app.get('/api/collections/suggestions', movieController.getCollectionSuggestions);
app.post('/api/collections', movieController.createCollection);
app.put('/api/collections/:id', movieController.updateCollection);
app.delete('/api/collections/:id', movieController.deleteCollection);
// Specific route for Watch Next must come before generic :id route
app.get('/api/collections/watch-next/movies', movieController.getWatchNextMovies);
app.get('/api/collections/:id/movies', movieController.getCollectionMovies);
app.post('/api/collections/cleanup', movieController.cleanupEmptyCollections);

// Movie collection routes
app.get('/api/movies/:id/collections', movieController.getMovieCollections);
app.post('/api/movies/:id/collections', movieController.addMovieToCollection);
app.put('/api/movies/:id/collections', movieController.updateMovieCollections);
app.delete('/api/movies/:movieId/collections/:collectionId', movieController.removeMovieFromCollection);
app.put('/api/movies/:movieId/collections/:collectionId/order', movieController.updateMovieOrder);
app.post('/api/collections/handle-name-change', movieController.handleCollectionNameChange);
app.get('/api/movies/check-status', movieController.checkMovieStatus);
app.get('/api/movies/check-editions', movieController.checkMovieEditions);
app.get('/api/movies/:id', movieController.getMovieById);
app.get('/api/movies/:id/details', movieController.getMovieDetails);
app.get('/api/movies/:id/cast', movieController.getMovieCast);
app.get('/api/movies/:id/crew', movieController.getMovieCrew);
app.post('/api/movies', movieController.createMovie);
app.post('/api/movies/add', movieController.addMovie);
app.post('/api/movies/add-with-pipeline', movieController.addMovieWithPipeline);
app.post('/api/movies/scan-cover', movieController.scanCover);
app.get('/api/tmdb/search', movieController.searchTMDB);
app.put('/api/movies/:id', movieController.updateMovie);
app.post('/api/movies/:id/refresh-ratings', movieController.refreshMovieRatings);
app.delete('/api/movies/:id', movieController.deleteMovie);
app.get('/api/movies/export/csv', movieController.exportCSV);

// Wish list routes
app.get('/api/movies/status/:status', movieController.getMoviesByStatus);
app.put('/api/movies/:id/status', movieController.updateMovieStatus);
app.post('/api/migrate/title-status', movieController.migrateTitleStatus);

// Watch Next routes
app.put('/api/movies/:id/watch-next', movieController.toggleWatchNext);

// Mark as Watched routes
app.put('/api/movies/:id/watched', movieController.markAsWatched);
app.delete('/api/movies/:id/watched', movieController.clearWatched);
app.put('/api/movies/:id/watch-count', movieController.updateWatchCount);

// TMDB Poster routes
app.get('/api/tmdb/:tmdbId/posters', movieController.getMoviePosters);

app.get('/api/ratings', movieController.fetchRatings);
app.get('/api/thumbnail', movieController.getMovieThumbnail);
app.get('/api/backdrop/:tmdbId', movieController.getMovieBackdrop);
// Serve images with support for subdirectories (e.g., cd/custom/filename.jpg)
// Route with subdirectory
app.get('/api/images/:type/:subdir/:filename', (req: Request, res: Response) => {
  const { type, subdir, filename } = req.params;
  const imagePath = path.join(configManager.getImagesPath(), type as string, subdir as string, filename as string);

  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ error: 'Image not found' });
  }
});
// Route without subdirectory (for backward compatibility)
app.get('/api/images/:type/:filename', (req: Request, res: Response) => {
  const { type, filename } = req.params;
  const imagePath = path.join(configManager.getImagesPath(), type as string, filename as string);

  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ error: 'Image not found' });
  }
});

// Import routes (CSV upload already handled above)
app.post('/api/import/process', importController.processCsv);
app.get('/api/import/:id', importController.getImportStatus);
app.post('/api/import/resolve', importController.resolveMovie);
app.post('/api/import/ignore', importController.ignoreMovie);

app.get('/api/import/:id/suggestions', importController.getMovieSuggestions);

// Analytics routes
app.get('/api/analytics', analyticsController.getAnalytics);
app.get('/api/analytics/music', analyticsController.getMusicAnalytics);
app.get('/api/analytics/books', analyticsController.getBookAnalytics);

// Cache management routes
app.post('/api/cache/invalidate', analyticsController.invalidateCache);
app.get('/api/cache/stats', analyticsController.getCacheStats);

// Music routes
app.get('/api/music/albums', musicController.getAllAlbums);
app.get('/api/music/albums/search', musicController.searchAlbums);
app.get('/api/music/albums/missing-covers', musicController.getAlbumsMissingCovers);
app.get('/api/music/albums/status/:status', musicController.getAlbumsByStatus);
app.get('/api/music/albums/export/csv', musicController.exportCSV);
app.post('/api/music/albums', musicController.addAlbum);
app.post('/api/music/albums/fill-covers', musicController.fillCovers);
app.get('/api/music/albums/:id', musicController.getAlbumById);
app.put('/api/music/albums/:id', musicController.updateAlbum);
app.put('/api/music/albums/:id/status', musicController.updateAlbumStatus);
app.delete('/api/music/albums/:id', musicController.deleteAlbum);
app.post('/api/music/albums/:id/upload-cover', musicController.coverUploadMiddleware, musicController.uploadCustomCover);
app.post('/api/music/albums/:id/upload-back-cover', musicController.coverUploadMiddleware, musicController.uploadCustomBackCover);
app.get('/api/music/autocomplete', musicController.getAutocompleteSuggestions);
app.get('/api/music/search', musicController.searchMusicBrainz);
app.get('/api/music/coverart/:releaseId', musicController.getCoverArt);
app.get('/api/music/search/catalog', musicController.searchByCatalogNumber);
app.get('/api/music/search/barcode', musicController.searchByBarcode);
app.get('/api/music/release/:releaseId', musicController.getMusicBrainzReleaseDetails);
app.post('/api/music/release/:releaseId', musicController.addAlbumFromMusicBrainz);
app.post('/api/music/barcode/:barcode', musicController.addAlbumByBarcode);
app.post('/api/music/migrate/resize-covers', musicController.resizeAllAlbumCovers);
app.get('/api/music/albums/:id/apple-music', musicController.getAppleMusicUrl);
app.put('/api/music/albums/:id/listen-next', musicController.toggleListenNext);
app.get('/api/collections/listen-next/albums', musicController.getListenNextAlbums);
app.post('/api/collections/listen-next/smart-fill', musicController.smartFillListenNext);
app.post('/api/collections/listen-next/shuffle/:albumId', musicController.shuffleListenNextAlbum);
app.get('/api/collections/listen-next/stats', musicController.getSmartPlaylistStats);

// Book routes
app.get('/api/books', bookController.getAllBooks);
app.get('/api/books/search', bookController.searchBooks);
app.get('/api/books/search/external', bookController.searchExternalBooks);
app.get('/api/books/search/series', bookController.searchSeriesVolumes);
app.get('/api/books/series', bookController.getBooksBySeries);
app.get('/api/books/status/:status', bookController.getBooksByStatus);
app.get('/api/books/export/csv', bookController.exportCSV);
app.get('/api/books/autocomplete', bookController.getAutocompleteSuggestions); // Must come before /:id route
app.post('/api/books', bookController.addBook);
app.post('/api/books/batch', bookController.addBooksBatch);
app.post('/api/books/enrich', bookController.enrichBook);
app.post('/api/books/scan-cover', bookController.scanCover);

// Book comment routes - Must come before /:id route
app.get('/api/books/comments/autocomplete/names', bookCommentController.getCommentNameSuggestions);
app.get('/api/books/comments/:id', bookCommentController.getCommentById);
app.post('/api/books/comments', bookCommentController.createComment);
app.put('/api/books/comments/:id', bookCommentController.updateComment);
app.delete('/api/books/comments/:id', bookCommentController.deleteComment);
app.get('/api/books/:bookId/comments', bookCommentController.getCommentsByBookId); // Must come after /comments/:id

app.post('/api/books/:id/re-enrich', bookController.reEnrichBook); // Must come before generic /:id route
app.get('/api/books/:id', bookController.getBookById);
app.put('/api/books/:id', bookController.updateBook);
app.put('/api/books/:id/status', bookController.updateBookStatus);
app.delete('/api/books/:id', bookController.deleteBook);
app.post('/api/books/:id/upload-cover', bookController.coverUploadMiddleware, bookController.uploadCustomCover);
app.post('/api/books/:id/upload-ebook', bookController.ebookUploadMiddleware, bookController.uploadEbook);
app.get('/api/books/:id/ebook/info', bookController.getEbookInfo);
app.get('/api/books/:id/ebook/download', bookController.downloadEbook);
app.delete('/api/books/:id/ebook', bookController.deleteEbook);

// Configuration endpoint for frontend
app.get('/api/config', (req: Request, res: Response) => {
  try {
    res.json({
      version: process.env.npm_package_version || '0.0.1'
    });
  } catch (error) {
    logger.error('Failed to get config:', (error as Error).message);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// Backup routes
app.post('/api/backup/create', backupController.createBackup);
app.get('/api/backup/list', backupController.listBackups);
app.get('/api/backup/download/:filename', backupController.downloadBackup);
app.post('/api/backup/restore', backupController.restoreBackup);
app.post('/api/backup/upload-restore', backupController.uploadMiddleware, backupController.uploadAndRestoreBackup);
app.delete('/api/backup/:filename', backupController.deleteBackup);
app.post('/api/backup/cleanup-restore', backupController.cleanupRestoreBackups);

// Cover scan health check
app.get('/api/cover-scan/health', async (req: Request, res: Response) => {
  try {
    const coverScanService = (await import('./src/services/coverScanService')).default;
    const health = await coverScanService.checkHealth();
    res.json(health);
  } catch (error) {
    res.json({ available: false, error: (error as Error).message });
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Static file serving for images with error handling
app.use('/images', (req: Request, res: Response, next: NextFunction) => {
  const filePath = path.join(configManager.getImagesPath(), req.path);

  // Check if file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // File doesn't exist, return 404 with proper headers
      res.status(404).json({ error: 'Image not found' });
    } else {
      // File exists, serve it
      express.static(configManager.getImagesPath())(req, res, next);
    }
  });
});

// Check if running in Home Assistant ingress mode
const isIngressMode = process.env.INGRESS_PORT || process.env.HASSIO_TOKEN;

// Serve frontend from /app/ path (or root for ingress)
// Check for frontend in both development and production locations
let frontendPath: string | null = null;

if (isIngressMode) {
  // Ingress mode: use frontend-ingress build
  const ingressPaths = [
    path.join(__dirname, '../frontend-ingress'), // Production ingress build
    path.join(__dirname, '../frontend/build'), // Development fallback
    path.join(__dirname, '../frontend'), // Production fallback
    path.join(process.cwd(), 'frontend-ingress') // Alternative location
  ];

  for (const testPath of ingressPaths) {
    if (fs.existsSync(testPath)) {
      frontendPath = testPath;
      break;
    }
  }
} else {
  // Normal mode: use regular frontend build
  const normalPaths = [
    path.join(__dirname, '../frontend'), // Production (from dist)
    path.join(__dirname, '../frontend/build'), // Development
    path.join(process.cwd(), 'frontend') // Fallback
  ];

  for (const testPath of normalPaths) {
    if (fs.existsSync(testPath)) {
      frontendPath = testPath;
      break;
    }
  }
}

if (frontendPath) {
  logger.info(`Serving frontend from: ${frontendPath}`);
  logger.info(`Ingress mode: ${isIngressMode ? 'enabled' : 'disabled'}`);

  if (isIngressMode) {
    // Ingress mode: serve frontend at root path with dynamic path rewriting
    logger.info('Running in Home Assistant ingress mode - serving frontend at root path');

    // Serve static files from frontend build (CSS, JS, images, etc.)
    // Note: In ingress mode, static files are served by Home Assistant's ingress proxy
    // We still need to serve them locally for development/testing
    app.use('/static', express.static(path.join(frontendPath, 'static')));

    // Function to rewrite HTML content for ingress paths
    const rewriteHtmlForIngress = (htmlContent: string, req: Request): string => {
      // Check for X-Ingress-Path header from Home Assistant
      const ingressPath = req.headers['x-ingress-path'] as string | undefined;

      if (ingressPath) {
        logger.info(`Detected ingress path: ${ingressPath}`);

        // Rewrite static asset paths to include ingress path
        return htmlContent
          .replace(/href="\/static\//g, `href="${ingressPath}/static/`)
          .replace(/src="\/static\//g, `src="${ingressPath}/static/`)
          .replace(/href="\/favicon/g, `href="${ingressPath}/favicon`)
          .replace(/href="\/logo/g, `href="${ingressPath}/logo`)
          .replace(/href="\/manifest/g, `href="${ingressPath}/manifest`);
      }

      return htmlContent;
    };

    // Helper to send index.html with no-cache headers and ingress rewriting
    const sendIngressIndexHtml = (req: Request, res: Response) => {
      // Debug: Log ingress headers
      logger.debug('Request headers:', {
        'x-ingress-path': req.headers['x-ingress-path'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
        'x-forwarded-host': req.headers['x-forwarded-host'],
        'host': req.headers['host'],
        'referer': req.headers['referer']
      });

      const htmlPath = path.join(frontendPath as string, 'index.html');
      let htmlContent = fs.readFileSync(htmlPath, 'utf8');

      // Rewrite HTML for ingress if needed
      htmlContent = rewriteHtmlForIngress(htmlContent, req);

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(htmlContent);
    };

    // Handle root route
    app.get('/', sendIngressIndexHtml);

    // Handle all other routes for React Router (catch-all)
    // But exclude API routes, images, static files, and health check
    app.use((req: Request, res: Response, next: NextFunction) => {
      // Skip catch-all for API routes, images, static files, and health check
      if (req.path.startsWith('/api/') ||
          req.path.startsWith('/images/') ||
          req.path.startsWith('/static/') ||
          req.path === '/health') {
        return next(); // Let Express continue to 404 handler if route not found
      }

      // For all other routes, serve the React app
      sendIngressIndexHtml(req, res);
    });
  } else {
    // Normal mode: serve frontend with /filmdex routing
    logger.info('Running in normal mode - serving frontend with /filmdex routing');

    // Add root redirect to /filmdex
    app.get('/', (req: Request, res: Response) => {
      res.redirect('/filmdex');
    });

    // Serve static files from frontend build (CSS, JS, images, etc.)
    // Vite hashes filenames, so we can cache them aggressively
    app.use('/static', express.static(path.join(frontendPath, 'static'), {
      maxAge: '1y',
      immutable: true,
    }));
    app.use('/assets', express.static(path.join(frontendPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));
    app.use('/', express.static(frontendPath, { index: false }));

    // Helper to send index.html with no-cache headers
    // This ensures browsers (especially iOS Safari / home screen PWAs)
    // always check for the latest version of the app shell
    const sendIndexHtml = (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(frontendPath as string, 'index.html'));
    };

    // Handle /filmdex route
    app.get('/filmdex', sendIndexHtml);

    // Handle all other routes for React Router (catch-all)
    app.use('/', sendIndexHtml);
  }

// Handle Chrome DevTools request to silence warning
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req: Request, res: Response) => {
  res.status(404).json({ message: 'Not found' });
});

// Root route is now handled by frontend serving above
} else {
  logger.warn('Frontend build not found, serving placeholder');
  app.get('/', (req: Request, res: Response) => {
    res.send(`
      <html>
        <head><title>FilmDex</title></head>
        <body>
          <h1>FilmDex Backend</h1>
          <p>Backend is running. Frontend build not found.</p>
          <p>API available at <a href="/api/config">/api/config</a></p>
        </body>
      </html>
    `);
  });
}

// Error handling middleware
app.use((err: Error & { code?: string }, req: Request, res: Response, next: NextFunction) => {
  logger.error('Request error:', err.stack);

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      error: `File size exceeds maximum allowed size of ${configManager.getMaxUploadMb()}MB`
    });
    return;
  }

  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req: Request, res: Response) => {
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Route not found' });
});

// Start the server
const serverReady = startServer().then(() => {
  // Only start listening if not in test environment
  if (process.env.NODE_ENV !== 'test') {
    const server = app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Frontend available at: http://localhost:${PORT}/app/`);
      logger.info(`API available at: http://localhost:${PORT}/api/`);
    });

    // Set a longer timeout for large file downloads (30 minutes)
    server.timeout = 30 * 60 * 1000;
    server.keepAliveTimeout = 30 * 60 * 1000;
    server.headersTimeout = 31 * 60 * 1000;
  }
}).catch((error: Error) => {
  logger.error('Failed to start server:', error);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
});

(app as unknown as express.Application & { serverReady: Promise<void> }).serverReady = serverReady;
export default app;
