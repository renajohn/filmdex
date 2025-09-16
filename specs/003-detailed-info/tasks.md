# Tasks: Movie Detail View

**Input**: Design documents from `/specs/003-detailed-info/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Web app**: `backend/src/`, `frontend/src/`

## Phase 3.1: Backend Setup & Tests
- [ ] T001 [P] Create a contract test for the `GET /movies/{id}/details` endpoint in `backend/tests/contract/movieDetails.test.js`.
- [ ] T002 [P] Create an integration test in `backend/tests/integration/movieDetails.test.js` to verify the movie details are fetched and returned correctly.

## Phase 3.2: Backend Implementation
- [ ] T003 Create a new function in `backend/src/services/omdbService.js` to fetch movie details from The Movie Database API.
- [ ] T004 Create a new function in `backend/src/services/movieService.js` to combine local movie data with data from the TMDB API.
- [ ] T005 Create a new controller function in `backend/src/controllers/movieController.js` for the `GET /movies/{id}/details` endpoint.
- [ ] T006 Add the new `GET /movies/{id}/details` route to the Express app in `backend/index.js`.

## Phase 3.3: Frontend Setup & Tests
- [ ] T007 [P] Create a test for the `MovieDetailCard` component in `frontend/src/components/MovieDetailCard.test.js`.
- [ ] T008 [P] Create an integration test in `frontend/src/App.test.js` to verify that clicking a movie card displays the `MovieDetailCard` with the correct data.

## Phase 3.4: Frontend Implementation
- [ ] T009 Create a new service function in `frontend/src/services/api.js` to fetch movie details from the backend API.
- [ ] T010 [P] Create the `MovieDetailCard.css` file to style the new component.
- [ ] T011 Create the `MovieDetailCard.js` component in `frontend/src/components/` to display the detailed movie information.
- [ ] T012 Modify `frontend/src/App.js` to handle clicks on movie thumbnails and display the `MovieDetailCard` component.

## Dependencies
- Backend tests (T001-T002) must be written and fail before backend implementation (T003-T006).
- Frontend tests (T007-T008) must be written and fail before frontend implementation (T009-T012).
- Backend implementation (T003-T006) must be complete before frontend implementation (T009-T012).

## Parallel Example
```
# Launch backend tests together:
Task: "T001 [P] Create a contract test for the GET /movies/{id}/details endpoint in backend/tests/contract/movieDetails.test.js."
Task: "T002 [P] Create an integration test in backend/tests/integration/movieDetails.test.js to verify the movie details are fetched and returned correctly."

# Launch frontend tests together:
Task: "T007 [P] Create a test for the MovieDetailCard component in frontend/src/components/MovieDetailCard.test.js."
Task: "T008 [P] Create an integration test in frontend/src/App.test.js to verify that clicking a movie card displays the MovieDetailCard with the correct data."
```
