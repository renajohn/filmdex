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
- Frontend proxies API calls to backend via Vite proxy config in dev mode

### Build System
- `build.js` — custom Node.js build script that assembles `dist/` with frontend build, backend source, Dockerfile, start script, and version info

### On covers, posters and books' covers: CoverTag and CoverButton
Everything laid over an image (an album cover, a movie poster, a book cover) uses the shared components in `frontend/src/components/shared/`; never style a tag or a button on an image by hand.
- **`CoverTag`** (`variant`: plain, gold, orange, muted, alert, on) for a tag: square-cornered, small capitals, dark glass with a light edge, its meaning in the colour of its words. Several together go in a **`CoverTagStack`** (a column of one width, at least 38px; or `direction="row"`).
- **`CoverButton`** (`label`, `active`, `size`: small/normal/large, `reveal`: hover/dim/always) for a round button: dark glass, a white ring under the pointer, plain gold with a dark icon when `active`. A button with `reveal="hover"` shows while the card holding it, which carries the class `cover-host`, is hovered. A `Menu` takes it as its trigger: `trigger={props => <CoverButton {...props} … />}`.
- The look lives in `shared/cover.css` alone. A component's own stylesheet only places a tag or a button in its corner (position, z-index), nothing else.
- Gold means "on" or "to do" (wished, to buy, in Listen/Watch Next, playing), red an alert (spiders, snakes, a book lent), orange a copy to do again.

### Menus: Menu
Every menu that opens from a button uses **`Menu`** (`frontend/src/components/shared/Menu.tsx`, look in `shared/menu.css`): never a react-bootstrap `Dropdown`, never a panel by hand.
- `trigger={(props, open) => <button {...props} …/>}`: spread the props, ref included, on any button (a `menu-pill`, a `CoverButton`, a Bootstrap `Button`); `MenuChevron` shows a turning chevron. `align` start/end, `drop` down/up (it flips when there is no room), `matchWidth` for a field.
- Entries: `Menu.Item` (an action: `icon`, `hint`, `danger`, `disabled`), `Menu.Choice` (one of several: `selected` wears a gold ✓), `Menu.Section` (a small-capitals title), `Menu.Separator`.
- The covers' dark glass, blurred; a light veil under the pointer or the keys; gold only for the choice made, red for danger. In a modal it lies in the modal, which keeps the focus.

### Key Patterns
- Each media type (movie, music, book) follows the same layered pattern: controller → service → model, with a corresponding frontend page, detail card, search component, and API service
- Collections/box sets are shared across media types via `collection` and `movieCollection`/`albumCollection` models
- Smart playlists and "Listen/Watch Next" features use `smartPlaylistService` and `playlistHistory` model
