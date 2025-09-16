# Tasks for Movie Collection App

This file breaks down the implementation of the Movie Collection App into smaller, executable tasks.

**Status**: 🔄 IN PROGRESS - Core functionality implemented with OAuth2 authentication. Enhanced features (FR-009 to FR-014) implemented. Column mapping (FR-015) pending implementation.

## Phase 1: Setup ✅

- **T001**: ✅ Initialize `backend` directory with `npm init -y` and create `index.js`.
- **T002**: ✅ Initialize `frontend` directory with `npx create-react-app frontend`.
- **T003**: ✅ Install `express`, `sqlite3`, `googleapis`, and `cors` in the `backend` directory.
- **T004**: ✅ Install `jest` and `supertest` in the `backend` directory for testing.

## Phase 2: Backend Development (Models and Services) ✅

- **T005**: ✅ Create `backend/src/models/movie.js` to define the Movie schema and database interactions.
- **T006**: ✅ Create `backend/src/services/movieService.js` to handle business logic for movies with OAuth2.
- **T007**: ✅ Create `backend/src/database.js` to set up the SQLite database connection.

## Phase 3: Backend Development (API Endpoints) ✅

- **T008**: ✅ Create `backend/src/controllers/movieController.js` to handle API requests and responses.
- **T009**: ✅ Implement the `GET /movies` endpoint in `backend/index.js` and `movieController.js`.
- **T010**: ✅ Implement the `POST /import` endpoint in `backend/index.js` and `movieController.js`.
- **T010a**: ✅ Implement OAuth2 authentication endpoints (`GET /auth/google`, `POST /auth/google/callback`).
- **T010b**: ✅ Add search endpoint (`GET /movies/search`) with multiple criteria support.

## Phase 4: Backend Testing ✅

- **T011**: ✅ Write contract tests for the `GET /movies` endpoint in `backend/tests/contract/movies.test.js`.
- **T012**: ✅ Write contract tests for the `POST /import` endpoint in `backend/tests/contract/import.test.js`.
- **T013**: ✅ Write integration tests for the movie service in `backend/tests/integration/movieService.test.js`.

## Phase 5: Frontend Development ✅

- **T014**: ✅ Create a `frontend/src/components/MovieSearch.js` component for searching movies.
- **T015**: ✅ Create a `frontend/src/components/MovieImport.js` component for importing movies from a Google Sheet with OAuth2.
- **T016**: ✅ Create a `frontend/src/services/api.js` service to interact with the backend API.
- **T017**: ✅ Update `frontend/src/App.js` to integrate the `MovieSearch` and `MovieImport` components.
- **T017a**: ✅ Add OAuth2 authentication flow to frontend components.
- **T017b**: ✅ Create responsive CSS styling for all components.

## Phase 6: Frontend Testing ✅

- **T018**: ✅ Write unit tests for the `MovieSearch` component.
- **T019**: ✅ Write unit tests for the `MovieImport` component.

## Phase 7: OAuth2 Integration ✅

- **T020**: ✅ Set up Google Cloud Console project and OAuth2 credentials.
- **T021**: ✅ Implement Google Sheets API integration with OAuth2 authentication.
- **T022**: ✅ Add token management and refresh handling.
- **T023**: ✅ Update documentation with OAuth2 setup instructions.

## Phase 8: Documentation and Deployment ✅

- **T024**: ✅ Create comprehensive quickstart guide with OAuth2 setup.
- **T025**: ✅ Update README with OAuth2 authentication features.
- **T026**: ✅ Add troubleshooting section for OAuth2 issues.
- **T027**: ✅ Create credentials template file for easy setup.

## Phase 9: Enhanced Movie Management Features (FR-009 to FR-014) 🔄

- **T028**: 🔄 Implement automatic IMDB/OMDB API integration for rating retrieval (FR-009).
- **T029**: 🔄 Update import form to mark IMDB and Rotten Tomato ratings as optional (FR-010).
- **T030**: 🔄 Create manual movie entry form with validation (FR-011).
- **T031**: 🔄 Implement movie editing functionality with form pre-population (FR-012).
- **T032**: 🔄 Add CSV export functionality for all movies (FR-013).
- **T033**: 🔄 Implement Google Sheets export with OAuth2 authentication (FR-014).

## Phase 10: Testing and Documentation for New Features ✅

- **T034**: ✅ Write unit tests for automatic rating retrieval functionality.
- **T035**: ✅ Write unit tests for manual movie entry form.
- **T036**: ✅ Write unit tests for movie editing functionality.
- **T037**: ✅ Write unit tests for CSV export functionality.
- **T038**: ✅ Write unit tests for Google Sheets export functionality.
- **T039**: ✅ Update documentation with new features and API endpoints.
- **T040**: ✅ Add troubleshooting section for OMDB API integration.

## Phase 11: Column Mapping Implementation (FR-015) ✅

- **T041**: ✅ Create backend API endpoint to fetch Google Sheets column headers.
- **T042**: ✅ Implement column mapping logic in movieService for flexible field mapping.
- **T043**: ✅ Create frontend ColumnMappingModal component for user column selection.
- **T044**: ✅ Update MovieImport component to integrate column mapping flow.
- **T045**: ✅ Add validation for required field mappings (Title, Year).
- **T046**: ✅ Update import process to use mapped columns instead of hardcoded fields.

## Phase 12: Testing and Documentation for Column Mapping 🔄

- **T047**: 🔄 Write unit tests for column mapping API endpoint.
- **T048**: 🔄 Write unit tests for ColumnMappingModal component.
- **T049**: 🔄 Write integration tests for column mapping flow.
- **T050**: 🔄 Update documentation with column mapping feature.
- **T051**: 🔄 Add troubleshooting section for column mapping issues.
