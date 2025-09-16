# Tasks: Add New Movie Flow

## Backend

### Phase 1: Tests (TDD)
- [ ] T001 [P] Contract test for `GET /api/movies/search` in `backend/tests/contract/movieSearch.test.js`. This test should check that the endpoint returns a 200 status code and an array of movies when provided with a valid query.
- [ ] T002 [P] Contract test for `POST /api/movies` in `backend/tests/contract/addMovie.test.js`. This test should check that the endpoint returns a 201 status code when a valid movie object is provided.
- [ ] T003 [P] Integration test for adding a movie in `backend/tests/integration/addMovie.test.js`. This test will simulate the entire flow of searching for a movie, and adding it to the database.

### Phase 2: Core Implementation
- [ ] T004 Create a new service `backend/src/services/tmdbService.js` to handle communication with the TMDB API. It should have a `searchMovies` method.
- [ ] T005 Create the `GET /api/movies/search` endpoint in `backend/src/controllers/movieController.js`. This endpoint will use the `tmdbService` to search for movies.
- [ ] T006 Create the `POST /api/movies` endpoint in `backend/src/controllers/movieController.js`. This endpoint will add a new movie to the database.
- [ ] T007 Implement the "Save to Spreadsheet" functionality in a new service `backend/src/services/spreadsheetService.js` and expose it via a new endpoint, e.g., `POST /api/spreadsheet/save`.

## Frontend

### Phase 1: Tests (TDD)
- [ ] T008 [P] Component test for `AutocompleteInput.js` in `frontend/src/components/AutocompleteInput.test.js`. This test should check that the component renders correctly and calls the search API on input change.
- [ ] T009 [P] Component test for `MovieForm.js` in `frontend/src/components/MovieForm.test.js`. This test should check that the form renders with pre-filled data and that it can be submitted.

### Phase 2: Core Implementation
- [ ] T010 [P] Create a new `AddMovie` page component in `frontend/src/pages/AddMovie.js`.
- [ ] T011 [P] Enhance the `AutocompleteInput.js` component in `frontend/src/components/AutocompleteInput.js` to fetch and display movie suggestions from the backend.
- [ ] T012 [P] Enhance the `MovieForm.js` component in `frontend/src/components/MovieForm.js` to handle editing and adding a new movie.
- [ ] T013 Implement the API service calls in `frontend/src/services/api.js` for searching movies and adding a new movie.
- [ ] T014 Add a "Save to Spreadsheet" button to the UI that calls the corresponding backend endpoint.

## Dependencies
- Backend tasks should be completed before frontend tasks that depend on them.
- Test tasks (T001-T003, T008-T009) must be written and fail before their corresponding implementation tasks.

## Parallel Example
```
# Launch backend contract tests in parallel:
Task: "T001 [P] Contract test for GET /api/movies/search..."
Task: "T002 [P] Contract test for POST /api/movies..."

# Launch frontend component tests in parallel:
Task: "T008 [P] Component test for AutocompleteInput.js..."
Task: "T009 [P] Component test for MovieForm.js..."
```