require('dotenv').config();
// Development mode test comment - updated for hot reload test
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const configManager = require('./src/config');
const logger = require('./src/logger');
const movieController = require('./src/controllers/movieController');
const { importController, uploadMiddleware } = require('./src/controllers/importController');
const analyticsController = require('./src/controllers/analyticsController');
const musicController = require('./src/controllers/musicController');
const musicService = require('./src/services/musicService');
const bookController = require('./src/controllers/bookController');
const bookService = require('./src/services/bookService');
const backupController = require('./src/controllers/backupController');
const Movie = require('./src/models/movie');
const MovieImport = require('./src/models/movieImport');
const MovieCast = require('./src/models/movieCast');
const MovieCrew = require('./src/models/movieCrew');
const Collection = require('./src/models/collection');
const MovieCollection = require('./src/models/movieCollection');
const { initDatabase } = require('./src/database');
const imageService = require('./src/services/imageService');

// Parse command line arguments
const args = process.argv.slice(2);
const deploymentFile = args.find(arg => arg.startsWith('--deployment='))?.split('=')[1] || 
                      args.find(arg => arg.startsWith('-d='))?.split('=')[1];

// Load configuration
try {
  configManager.loadDeploymentConfig(deploymentFile);
  configManager.loadDataConfig();
} catch (error) {
  logger.error('Configuration loading failed:', error.message);
  logger.info('Usage: node index.js [--deployment=path/to/deployment.json]');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.static('public'));

// Apply multer middleware specifically for file upload routes BEFORE JSON parsing
app.post('/api/import/csv', uploadMiddleware, importController.uploadCsv);
app.post('/api/movies/:id/upload-poster', movieController.posterUploadMiddleware, movieController.uploadCustomPoster);

// JSON parsing middleware for all other routes (with increased limit for cover art)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize database
const startServer = async () => {
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
      logger.warn('Failed to initialize ebooks directory:', error.message);
      // Don't block initialization if ebooks directory creation fails
    }
    
    // Initialize music tables
    await musicService.initializeTables();
    
    // Note: Book tables are initialized in database.js during initDatabase()
    
    logger.info('Database initialized successfully');
    logger.info(`Using database: ${configManager.getDatabasePath()}`);
    logger.info(`Using images directory: ${configManager.getImagesPath()}`);
    logger.info(`Using ebooks directory: ${configManager.getEbooksPath()}`);
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

// TMDB Poster routes
app.get('/api/tmdb/:tmdbId/posters', movieController.getMoviePosters);

app.get('/api/ratings', movieController.fetchRatings);
app.get('/api/thumbnail', movieController.getMovieThumbnail);
app.get('/api/backdrop/:tmdbId', movieController.getMovieBackdrop);
// Serve images with support for subdirectories (e.g., cd/custom/filename.jpg)
// Route with subdirectory
app.get('/api/images/:type/:subdir/:filename', (req, res) => {
  const { type, subdir, filename } = req.params;
  const imagePath = path.join(configManager.getImagesPath(), type, subdir, filename);
  
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ error: 'Image not found' });
  }
});
// Route without subdirectory (for backward compatibility)
app.get('/api/images/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const imagePath = path.join(configManager.getImagesPath(), type, filename);
  
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

// Book comment routes - Must come before /:id route
const bookCommentController = require('./src/controllers/bookCommentController');
app.get('/api/books/comments/autocomplete/names', bookCommentController.getCommentNameSuggestions);
app.get('/api/books/comments/:id', bookCommentController.getCommentById);
app.post('/api/books/comments', bookCommentController.createComment);
app.put('/api/books/comments/:id', bookCommentController.updateComment);
app.delete('/api/books/comments/:id', bookCommentController.deleteComment);
app.get('/api/books/:bookId/comments', bookCommentController.getCommentsByBookId); // Must come after /comments/:id

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
app.get('/api/config', (req, res) => {
  try {
    res.json({
      version: process.env.npm_package_version || '0.0.1'
    });
  } catch (error) {
    logger.error('Failed to get config:', error.message);
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Static file serving for images with error handling
app.use('/images', (req, res, next) => {
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
let frontendPath = null;

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
    const rewriteHtmlForIngress = (htmlContent, req) => {
      // Check for X-Ingress-Path header from Home Assistant
      const ingressPath = req.headers['x-ingress-path'];
      
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
    
    // Handle root route
    app.get('/', (req, res) => {
      // Debug: Log ingress headers
      logger.debug('Request headers:', {
        'x-ingress-path': req.headers['x-ingress-path'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
        'x-forwarded-host': req.headers['x-forwarded-host'],
        'host': req.headers['host'],
        'referer': req.headers['referer']
      });
      
      const htmlPath = path.join(frontendPath, 'index.html');
      let htmlContent = fs.readFileSync(htmlPath, 'utf8');
      
      // Rewrite HTML for ingress if needed
      htmlContent = rewriteHtmlForIngress(htmlContent, req);
      
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    });
    
    // Handle all other routes for React Router (catch-all)
    // But exclude API routes, images, static files, and health check
    app.use((req, res, next) => {
      // Skip catch-all for API routes, images, static files, and health check
      if (req.path.startsWith('/api/') || 
          req.path.startsWith('/images/') || 
          req.path.startsWith('/static/') ||
          req.path === '/health') {
        return next(); // Let Express continue to 404 handler if route not found
      }
      
      // For all other routes, serve the React app
      const htmlPath = path.join(frontendPath, 'index.html');
      let htmlContent = fs.readFileSync(htmlPath, 'utf8');
      
      // Rewrite HTML for ingress if needed
      htmlContent = rewriteHtmlForIngress(htmlContent, req);
      
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    });
  } else {
    // Normal mode: serve frontend with /filmdex routing
    logger.info('Running in normal mode - serving frontend with /filmdex routing');
    
    // Add root redirect to /filmdex
    app.get('/', (req, res) => {
      res.redirect('/filmdex');
    });
    
    // Serve static files from frontend build (CSS, JS, images, etc.)
    app.use('/static', express.static(path.join(frontendPath, 'static')));
    app.use('/', express.static(frontendPath, { index: false }));
    
    // Handle /filmdex route
    app.get('/filmdex', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
    
    // Handle all other routes for React Router (catch-all)
    app.use('/', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }
  
// Handle Chrome DevTools request to silence warning
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Root route is now handled by frontend serving above
} else {
  logger.warn('Frontend build not found, serving placeholder');
  app.get('/', (req, res) => {
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
app.use((err, req, res, next) => {
  logger.error('Request error:', err.stack);
  
  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ 
      error: `File size exceeds maximum allowed size of ${configManager.getMaxUploadMb()}MB` 
    });
  }
  
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Route not found' });
});

// Start the server
startServer().then(() => {
  const server = app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
    logger.info(`Frontend available at: http://localhost:${PORT}/app/`);
    logger.info(`API available at: http://localhost:${PORT}/api/`);
  });
  
  // Set a longer timeout for large file downloads (30 minutes)
  // This prevents the server from closing connections during large backup downloads
  server.timeout = 30 * 60 * 1000; // 30 minutes in milliseconds
  server.keepAliveTimeout = 30 * 60 * 1000; // 30 minutes
  server.headersTimeout = 31 * 60 * 1000; // Slightly longer than keepAliveTimeout
}).catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = app;