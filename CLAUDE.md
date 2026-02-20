# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DexVault is a web app for managing physical media collections (movies, music, books). It uses a React frontend with a Node.js/Express backend, SQLite database, and enriches data from external APIs (TMDB, OMDB, MusicBrainz).

## Commands

```bash
# Install all dependencies (root + frontend + backend)
npm run install:all

# Development (runs frontend on :3000 and backend on :3001 concurrently with hot reload)
npm run dev

# Build
npm run build:dev    # development build
npm run build:prod   # production build

# Run built app
npm start            # runs dist/start.sh

# Frontend tests
cd frontend && npx vitest              # interactive watch mode
cd frontend && npx vitest --run        # single run
cd frontend && npx vitest --run ComponentName  # single test file
```

## Architecture

**Monorepo with three package.json files:** root (orchestration/dev tooling), `frontend/` (React Vite app), `backend/` (Express API server). Fully TypeScript.

### Backend (`backend/`)
- **Express 5** server with SQLite3 database
- MVC pattern: `src/controllers/` → `src/services/` → `src/models/`
- Controllers: movie, music, book, import, analytics, backfill, backup, bookComment
- External API integrations: `tmdbService`, `omdbService`, `musicbrainzService`, `bookApiService`, `bookImslpService`
- Image handling: `imageService` (download/storage), `posterService` (movie posters), `bookCoverService`
- Database migrations in `backend/migrations/` and inline in `src/database.ts` (`runAutoMigrations`)
- Config hierarchy: `deployment.{dev,prod}.json` → `data/options.json` → environment variables
- Data directory (`data/`) holds `db.sqlite`, `options.json`, and `images/` — mounted as volume in Docker

### Frontend (`frontend/`)
- **React 19** with Vite, React Router 7, React Bootstrap, react-icons
- Main app shell in `App.tsx` — manages search state, navigation pills, and routing
- Pages: FilmDexPage (movies), MusicDexPage, BookDexPage, WishListPage, AnalyticsPage, BackupPage, ImportPage
- Shared collection components in `components/shared/` (CollectionGrid, CollectionHeader, NextBanner, EmptyState)
- Service layer in `services/` — `api.ts` (movies/general), `musicService.ts`, `bookService.ts`, `bookCommentService.ts`, `backupService.ts`
- Supports Home Assistant ingress mode (detected via URL path in `api.ts`)
- Frontend proxies API calls to backend via Vite proxy config in dev mode

### Build System
- `build.js` — custom Node.js build script that assembles `dist/` with frontend build, backend source, Dockerfile, start script, and version info
- Produces two frontend builds: normal and ingress (for Home Assistant)

### Key Patterns
- Each media type (movie, music, book) follows the same layered pattern: controller → service → model, with a corresponding frontend page, detail card, search component, and API service
- Collections/box sets are shared across media types via `collection` and `movieCollection`/`albumCollection` models
- Smart playlists and "Listen/Watch Next" features use `smartPlaylistService` and `playlistHistory` model
