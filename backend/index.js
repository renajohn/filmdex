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
const Movie = require('./src/models/movie');
const MovieImport = require('./src/models/movieImport');
const MovieCast = require('./src/models/movieCast');
const MovieCrew = require('./src/models/movieCrew');
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

// JSON parsing middleware for all other routes
app.use(express.json());

// Initialize database
const startServer = async () => {
  try {
    await initDatabase();
    await Movie.createTable();
    await MovieImport.createTable();
    await MovieCast.createTable();
    await MovieCrew.createTable();
    
    // Initialize services with configuration
    await imageService.init();
    
    logger.info('Database initialized successfully');
    logger.info(`Using database: ${configManager.getDatabasePath()}`);
    logger.info(`Using images directory: ${configManager.getImagesPath()}`);
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
app.get('/api/movies/:id', movieController.getMovieById);
app.get('/api/movies/:id/details', movieController.getMovieDetails);
app.get('/api/movies/:id/cast', movieController.getMovieCast);
app.get('/api/movies/:id/crew', movieController.getMovieCrew);
app.post('/api/movies', movieController.createMovie);
app.post('/api/movies/add', movieController.addMovie);
app.post('/api/movies/add-with-pipeline', movieController.addMovieWithPipeline);
app.get('/api/tmdb/search', movieController.searchTMDB);
app.put('/api/movies/:id', movieController.updateMovie);
app.delete('/api/movies/:id', movieController.deleteMovie);
app.get('/api/movies/export/csv', movieController.exportCSV);
app.get('/api/ratings', movieController.fetchRatings);
app.get('/api/thumbnail', movieController.getMovieThumbnail);
app.get('/api/backdrop/:tmdbId', movieController.getMovieBackdrop);
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Static file serving for images (must be after specific routes)
app.use('/images', express.static(configManager.getImagesPath()));

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
    app.use('/', express.static(frontendPath, { index: false }));
    
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
    app.use('/', (req, res) => {
      const htmlPath = path.join(frontendPath, 'index.html');
      let htmlContent = fs.readFileSync(htmlPath, 'utf8');
      
      // Rewrite HTML for ingress if needed
      htmlContent = rewriteHtmlForIngress(htmlContent, req);
      
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    });
  } else {
    // Normal mode: serve frontend at /app path
    logger.info('Running in normal mode - serving frontend at /app path');
    
    // Serve static files from frontend build (CSS, JS, images, etc.)
    app.use('/app/static', express.static(path.join(frontendPath, 'static')));
    app.use('/app', express.static(frontendPath, { index: false }));
    
    // Handle all /app routes for SPA routing
    app.get('/app', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
    
    app.get('/app/', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
    
    // Handle all other /app routes for React Router (catch-all)
    app.use('/app', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }
  
// Handle Chrome DevTools request to silence warning
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Redirect root to /app/
app.get('/', (req, res) => {
  res.redirect('/app/');
});
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
  app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
    logger.info(`Frontend available at: http://localhost:${PORT}/app/`);
    logger.info(`API available at: http://localhost:${PORT}/api/`);
  });
}).catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = app;