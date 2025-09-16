# Tasks: CSV Import

**Input**: Design documents from `/specs/006-import-csv-user/`

## Backend

### Setup
- [ ] T001 [P] Install `multer` and `csv-parser` dependencies in the `backend` directory.

### Data Models
- [ ] T002 [P] Create the `MovieImport` model in `backend/src/models/movieImport.js`.
- [ ] T003 [P] Add `importId` to the `Movie` model in `backend/src/models/movie.js`.

### Tests
- [ ] T004 [P] Create contract test for `POST /api/import/csv` in `backend/tests/contract/importCsv.test.js`.
- [ ] T005 [P] Create contract test for `GET /api/import/{id}` in `backend/tests/contract/importStatus.test.js`.
- [ ] T006 [P] Create contract test for `POST /api/import/resolve` in `backend/tests/contract/resolveMovie.test.js`.
- [ ] T007 [P] Create integration test for the entire CSV import flow in `backend/tests/integration/csvImport.test.js`.

### Services
- [ ] T008 Create `ImportService` in `backend/src/services/importService.js` with methods to:
    - Create a new import session.
    - Process the uploaded CSV file.
    - Enrich movie data using `OmdbService` and `TmdbService`.
    - Identify unmatched movies.
    - Add new movies to the database.
    - Update the status of the import session.
- [ ] T009 Create a method in `ImportService` to resolve an unmatched movie.

### API (Controllers)
- [ ] T010 Create a new controller `importController.js` in `backend/src/controllers/`.
- [ ] T011 Implement the `POST /api/import/csv` endpoint in `importController.js`.
- [ ] T012 Implement the `GET /api/import/{id}` endpoint in `importController.js`.
- [ ] T013 Implement the `POST /api/import/resolve` endpoint in `importController.js`.
- [ ] T014 Update `backend/index.js` to use the new `importController`.

## Frontend

### Setup
- [ ] T015 [P] No new dependencies needed for the frontend.

### Components
- [ ] T016 [P] Create a new `MovieImport.js` component in `frontend/src/components/` for uploading the CSV file.
- [ ] T017 [P] Create a new `UnmatchedMovies.js` component in `frontend/src/components/` to display and resolve unmatched movies.

### Pages
- [ ] T018 Create a new `ImportPage.js` in `frontend/src/pages/` that uses the `MovieImport` and `UnmatchedMovies` components.
- [ ] T019 Update the routing in `frontend/src/App.js` to include the new `ImportPage`.

### Services
- [ ] T020 Update `frontend/src/services/api.js` to include methods for:
    - Uploading the CSV file.
    - Fetching the import status.
    - Resolving an unmatched movie.

### Tests
- [ ] T021 [P] Create tests for the `MovieImport` component in `frontend/src/components/MovieImport.test.js`.
- [ ] T022 [P] Create tests for the `UnmatchedMovies` component in `frontend/src/components/UnmatchedMovies.test.js`.

## Dependencies
- Backend tasks should be completed before frontend tasks.
- Test tasks (T004-T007, T021-T022) should be completed before their corresponding implementation tasks.
- `MovieImport` model (T002) and `Movie` model update (T003) should be completed before `ImportService` (T008).
- `ImportService` (T008) should be completed before `importController` (T010-T013).
