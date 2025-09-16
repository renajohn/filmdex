# FilmDex - Movie Collection Manager

A modern web application for managing and searching your physical movie collection. Import movies from CSV files or add them manually, with automatic data enrichment from TMDB and OMDB APIs.

## Features

- **CSV Import**: Import your movie collection from CSV files with automatic column mapping
- **Manual Movie Addition**: Add movies individually with search and auto-complete
- **Multi-criteria Search**: Search movies by title, genre, director, actor, year, format, and ratings
- **Automatic Data Enrichment**: Fetch movie details, posters, and metadata from TMDB/OMDB APIs
- **Modern UI**: Clean, responsive interface with React Router navigation
- **SQLite Database**: Local data storage for your collection
- **Image Management**: Automatic poster and backdrop image downloads
- **Development Mode**: Hot reloading for both frontend and backend development
- **Docker Support**: Containerized deployment with volume mounting for data persistence

## Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm
- TMDB API key (optional, for movie data enrichment)
- OMDB API key (optional, for additional movie data)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd pokedex
   ```

2. **Install all dependencies:**
   ```bash
   npm run install:all
   ```

3. **Configure API keys (optional):**
   ```bash
   # Edit data/config.json
   {
     "tmdb_api_key": "your_tmdb_key_here",
     "omdb_api_key": "your_omdb_key_here",
     "log_level": "info",
     "max_upload_mb": 20
   }
   ```

### Development Mode

Start both frontend and backend with hot reloading:

```bash
npm run dev
```

This will start:
- **Frontend**: `http://localhost:3000` (with hot reloading)
- **Backend**: `http://localhost:3001` (with auto-restart on file changes)

### Production Build

Build and run the production version:

```bash
# Build for development
npm run build:dev

# Build for production
npm run build:prod

# Start the built application
npm start
```

## Usage

### Adding Movies

1. **Manual Addition**: Go to "Add Movie" and search for movies by title
2. **CSV Import**: Go to "Import" and upload a CSV file with your movie collection

### Searching Movies

Use the search interface to find movies by:
- Title (partial matches)
- Genre
- Director
- Actor (searches in cast)
- Year (exact match)
- Format (Blu-ray, DVD, 4K UHD)
- Minimum IMDB Rating
- Minimum Rotten Tomatoes Rating

### CSV Import Format

Your CSV file should include columns like:
- Title, Year, Genre, Director, Cast, Format, IMDB Rating, Plot, etc.

The import system will automatically map columns and suggest matches for unmatched movies.

## API Endpoints

- `GET /api/movies` - Get all movies
- `GET /api/movies/search` - Search movies with query parameters
- `POST /api/movies` - Add a new movie
- `GET /api/movies/:id` - Get movie details
- `POST /api/import` - Import movies from CSV
- `GET /api/import/:id` - Get import status
- `GET /api/config` - Get application configuration
- `GET /api/health` - Health check

## Development

### Project Structure

```
├── backend/                 # Express.js backend
│   ├── src/
│   │   ├── controllers/     # API controllers
│   │   ├── models/         # Database models
│   │   ├── services/       # Business logic
│   │   ├── config.js       # Configuration management
│   │   └── logger.js       # Logging system
│   └── index.js            # Main server file
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   └── App.js         # Main app component
│   └── public/            # Static assets
├── data/                   # Data directory (mounted as volume)
│   ├── config.json        # Runtime configuration
│   ├── db.sqlite          # SQLite database
│   └── images/            # Movie images
├── dist/                   # Build output (git ignored)
├── build.js               # Build script
└── package.json           # Root package configuration
```

### Available Scripts

#### Root Level
- `npm run dev` - Start development mode with hot reloading
- `npm run build:dev` - Build for development
- `npm run build:prod` - Build for production
- `npm start` - Start built application
- `npm run test:local` - Build and test locally
- `npm run test:prod` - Build and test production
- `npm run clean` - Clean dist directory
- `npm run install:all` - Install all dependencies

#### Backend
- `npm run dev` - Start with nodemon (auto-restart)
- `npm start` - Start production server

#### Frontend
- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests

### Configuration

The application uses a hierarchical configuration system:

1. **Deployment Config** (`deployment.dev.json` / `deployment.prod.json`):
   - Data path location
   - Platform type (localhost/docker)
   - Deployment target

2. **Data Config** (`data/config.json`):
   - API keys (TMDB, OMDB)
   - Log level
   - Max upload size
   - Base URL

3. **Environment Variables**:
   - Override configuration at runtime
   - Used for Docker deployments

## Docker Deployment

### Build Docker Image

```bash
npm run docker:build
```

### Run with Docker

```bash
npm run docker:run
```

### Docker Compose

```yaml
version: '3.8'
services:
  filmdex:
    image: filmdex:latest
    ports:
      - "3001:3001"
    volumes:
      - ./data:/data
    environment:
      - TMDB_API_KEY=your_key_here
      - OMDB_API_KEY=your_key_here
```

## Database Schema

The application uses SQLite with the following main tables:

### Movies
- `id` - Primary key
- `title` - Movie title
- `year` - Release year
- `genre` - Movie genre
- `director` - Director name
- `cast` - JSON array of cast members
- `format` - Physical format (Blu-ray, DVD, etc.)
- `imdb_rating` - IMDB rating (0-10)
- `rotten_tomato_rating` - Rotten Tomatoes rating (0-100)
- `plot` - Movie plot/summary
- `poster_path` - Local poster image path
- `backdrop_path` - Local backdrop image path
- `acquired_date` - Date when you acquired the movie
- `media_type` - Type of media (movie, tv, etc.)

### Movie Cast & Crew
- `movie_id` - Foreign key to movies
- `person_id` - TMDB person ID
- `name` - Person name
- `character` - Character name (for cast)
- `job` - Job title (for crew)
- `profile_path` - Profile image path

## Security

See [SECURITY.md](./SECURITY.md) for detailed security guidelines.

## License

MIT
