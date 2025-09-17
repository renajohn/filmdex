# FilmDex Backend

Express.js backend API for the FilmDex movie collection manager. Provides RESTful endpoints for movie management, CSV import, and data enrichment.

## Architecture

### Core Components

- **Express.js Server**: RESTful API with middleware support
- **SQLite Database**: Local data storage with SQLite3
- **Configuration Management**: Hierarchical config system
- **Logging System**: Structured logging with configurable levels
- **Image Service**: Automatic poster and backdrop downloads
- **Import Service**: CSV processing with column mapping

### Project Structure

```
backend/
├── src/
│   ├── controllers/        # API route handlers
│   │   ├── movieController.js
│   │   └── importController.js
│   ├── models/            # Database models
│   │   ├── movie.js
│   │   ├── movieCast.js
│   │   ├── movieCrew.js
│   │   ├── movieImport.js
│   │   └── unmatchedMovie.js
│   ├── services/          # Business logic
│   │   ├── movieService.js
│   │   ├── importService.js
│   │   ├── imageService.js
│   │   ├── tmdbService.js
│   │   ├── omdbService.js
│   │   └── posterService.js
│   ├── config.js          # Configuration management
│   ├── database.js        # Database initialization
│   └── logger.js          # Logging system
├── tests/                 # Test suites
│   ├── contract/          # API contract tests
│   ├── integration/       # Integration tests
│   └── setup.js          # Test setup
├── index.js              # Main server file
└── package.json          # Dependencies and scripts
```

## API Endpoints

### Movies

#### Get All Movies
```http
GET /api/movies
```

**Query Parameters:**
- `limit` - Number of movies to return (default: 50)
- `offset` - Number of movies to skip (default: 0)
- `sort` - Sort field (title, year, rating, etc.)
- `order` - Sort order (asc, desc)

**Response:**
```json
{
  "movies": [...],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

#### Search Movies
```http
GET /api/movies/search
```

**Query Parameters:**
- `q` - Search query
- `genre` - Filter by genre
- `director` - Filter by director
- `actor` - Filter by actor
- `year` - Filter by year
- `format` - Filter by format
- `min_rating` - Minimum IMDB rating
- `min_rt_rating` - Minimum Rotten Tomatoes rating

#### Get Movie Details
```http
GET /api/movies/:id
```

#### Add Movie
```http
POST /api/movies
```

**Request Body:**
```json
{
  "title": "Movie Title",
  "year": 2023,
  "genre": "Action",
  "director": "Director Name",
  "cast": ["Actor 1", "Actor 2"],
  "format": "Blu-ray",
  "imdb_rating": 8.5,
  "rotten_tomato_rating": 85,
  "plot": "Movie plot...",
  "acquired_date": "2023-01-01"
}
```

### Import

#### Start CSV Import
```http
POST /api/import
```

**Request Body:**
- `file` - CSV file (multipart/form-data)
- `columnMapping` - Optional column mapping

#### Get Import Status
```http
GET /api/import/:id
```

**Response:**
```json
{
  "id": "import_id",
  "status": "processing|completed|failed",
  "progress": 75,
  "total": 100,
  "processed": 75,
  "unmatched": 5,
  "errors": []
}
```

#### Resolve Unmatched Movies
```http
POST /api/import/:id/resolve
```

**Request Body:**
```json
{
  "unmatchedId": "unmatched_id",
  "movieId": "tmdb_movie_id",
  "action": "match|ignore"
}
```

### Configuration

#### Get App Config
```http
GET /api/config
```

**Response:**
```json
{
  "version": "0.0.1",
  "has_tmdb_key": true,
  "has_omdb_key": true
}
```

### Health Check
```http
GET /api/health
```

## Services

### MovieService

Core business logic for movie operations:

```javascript
// Search movies with filters
const movies = await movieService.searchMovies({
  query: 'action',
  genre: 'Action',
  year: 2023,
  minRating: 7.0
});

// Add movie with data enrichment
const movie = await movieService.addMovie(movieData);

// Get movie details
const details = await movieService.getMovieById(id);
```

### ImportService

CSV import processing:

```javascript
// Start import process
const importId = await importService.startImport(csvFile, columnMapping);

// Get import status
const status = await importService.getImportStatus(importId);

// Resolve unmatched movies
await importService.resolveUnmatched(unmatchedId, movieId, action);
```

### ImageService

Image download and management:

```javascript
// Download poster image
const posterPath = await imageService.downloadPoster(tmdbPath, movieId);

// Download backdrop image
const backdropPath = await imageService.downloadBackdrop(tmdbPath, movieId);

// Get image URL
const imageUrl = imageService.getImageUrl(localPath);
```

### TMDBService

The Movie Database API integration:

```javascript
// Search movies
const results = await tmdbService.searchMovies(query);

// Get movie details
const details = await tmdbService.getMovieDetails(tmdbId);

// Get movie credits
const credits = await tmdbService.getMovieCredits(tmdbId);
```

### OMDBService

Open Movie Database API integration:

```javascript
// Get movie details
const details = await omdbService.getMovieDetails(imdbId);

// Search movies
const results = await omdbService.searchMovies(title, year);
```

## Database Models

### Movie Model

```javascript
{
  id: INTEGER PRIMARY KEY,
  title: TEXT NOT NULL,
  year: INTEGER,
  genre: TEXT,
  director: TEXT,
  cast: TEXT, // JSON array
  format: TEXT,
  imdb_rating: REAL,
  rotten_tomato_rating: INTEGER,
  plot: TEXT,
  poster_path: TEXT,
  backdrop_path: TEXT,
  acquired_date: TEXT,
  media_type: TEXT DEFAULT 'movie',
  created_at: DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at: DATETIME DEFAULT CURRENT_TIMESTAMP
}
```

### Movie Cast Model

```javascript
{
  id: INTEGER PRIMARY KEY,
  movie_id: INTEGER REFERENCES movies(id),
  person_id: INTEGER,
  name: TEXT,
  character: TEXT,
  profile_path: TEXT,
  order: INTEGER
}
```

### Movie Crew Model

```javascript
{
  id: INTEGER PRIMARY KEY,
  movie_id: INTEGER REFERENCES movies(id),
  person_id: INTEGER,
  name: TEXT,
  job: TEXT,
  department: TEXT,
  profile_path: TEXT
}
```

## Configuration

### Environment Variables

```bash
# API Keys
TMDB_API_KEY=your_tmdb_key
OMDB_API_KEY=your_omdb_key

# Server Settings
PORT=3001
NODE_ENV=development|production

# Database
DATABASE_PATH=./data/db.sqlite

# Images
IMAGES_PATH=./data/images
```

### Configuration Files

#### data/options.json
```json
{
  "tmdb_api_key": "your_tmdb_key",
  "omdb_api_key": "your_omdb_key",
  "log_level": "info",
  "max_upload_mb": 20
}
```

#### deployment.json
```json
{
  "data_path": "./data",
  "platform": "localhost",
  "deployment": "dev"
}
```

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm
- SQLite3

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure API keys:**
   ```bash
   # Edit data/options.json
   {
     "tmdb_api_key": "your_key_here",
     "omdb_api_key": "your_key_here"
   }
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

### Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start with nodemon (auto-restart)
- `npm test` - Run tests

### Testing

#### Contract Tests
Test API contracts and responses:
```bash
npm run test:contract
```

#### Integration Tests
Test full integration flows:
```bash
npm run test:integration
```

## Logging

The backend uses a structured logging system with configurable levels:

```javascript
const logger = require('./src/logger');

logger.info('Server started on port 3001');
logger.warn('API key not configured');
logger.error('Database connection failed');
logger.debug('Processing movie data');
```

### Log Levels

- `error` - Error messages
- `warn` - Warning messages
- `info` - Informational messages
- `debug` - Debug messages

## Error Handling

The API uses consistent error responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional error details"
}
```

### Common Error Codes

- `VALIDATION_ERROR` - Request validation failed
- `NOT_FOUND` - Resource not found
- `DUPLICATE_ENTRY` - Resource already exists
- `EXTERNAL_API_ERROR` - External API call failed
- `DATABASE_ERROR` - Database operation failed

## Performance

### Database Optimization

- Indexes on frequently queried fields
- Prepared statements for security
- Connection pooling
- Query optimization

### Caching

- Image caching for downloaded posters
- API response caching (future enhancement)
- Database query caching (future enhancement)

## Security

- Input validation and sanitization
- SQL injection prevention
- CORS configuration
- Rate limiting (future enhancement)
- Authentication (future enhancement)

## Monitoring

- Health check endpoint
- Structured logging
- Error tracking
- Performance metrics (future enhancement)
