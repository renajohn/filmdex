# Tasks: MusicDex

**Input**: Design documents from `/specs/007-musicdex/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/

## Path Conventions
- **Web app**: `backend/src/`, `frontend/src/`

## Phase 3.1: Backend Setup
- [ ] T001 Install `musicbrainz-api` dependency in `backend/package.json`.
- [ ] T002 Create a database migration file in `backend/migrations/` for the `cds` and `tracks` tables.

## Phase 3.2: Backend Tests (TDD)
- [ ] T003 [P] Create contract test for `POST /api/music/cds` in `backend/tests/contract/add_cd.test.js`.
- [ ] T004 [P] Create contract test for `GET /api/music/cds/{id}` in `backend/tests/contract/get_cd.test.js`.
- [ ] T005 [P] Create contract test for `PUT /api/music/cds/{id}` in `backend/tests/contract/update_cd.test.js`.
- [ ] T006 [P] Create contract test for `DELETE /api/music/cds/{id}` in `backend/tests/contract/delete_cd.test.js`.
- [ ] T007 [P] Create contract test for `GET /api/music/search` in `backend/tests/contract/search_cds.test.js`.
- [ ] T008 [P] Create integration test for the "add CD" user story in `backend/tests/integration/add_cd_story.test.js`.

## Phase 3.3: Backend Implementation
- [ ] T009 Create `Cd` and `Track` models in `backend/src/models/`.
- [ ] T010 Create `musicbrainzService.js` in `backend/src/services/` to interact with the MusicBrainz API.
- [ ] T011 Create `musicService.js` in `backend/src/services/` for business logic.
- [ ] T012 Implement `POST /api/music/cds` endpoint in a new `backend/src/controllers/musicController.js`.
- [ ] T013 Implement `GET /api/music/cds/{id}` endpoint in `backend/src/controllers/musicController.js`.
- [ ] T014 Implement `PUT /api/music/cds/{id}` endpoint in `backend/src/controllers/musicController.js`.
- [ ] T015 Implement `DELETE /api/music/cds/{id}` endpoint in `backend/src/controllers/musicController.js`.
- [ ] T016 Implement `GET /api/music/search` endpoint in `backend/src/controllers/musicController.js`.

## Phase 4.1: Frontend Setup
- [ ] T017 Create a new "MusicDex" tab in the main navigation component in `frontend/src/App.js`.

## Phase 4.2: Frontend Implementation
- [ ] T018 Create `musicService.js` in `frontend/src/services/` to interact with the backend API.
- [ ] T019 [P] Create `MusicSearch.js` component in `frontend/src/components/`.
- [ ] T020 [P] Create `MusicDetailCard.js` component in `frontend/src/components/`.
- [ ] T021 [P] Create `AddMusicDialog.js` component in `frontend/src/components/`.
- [ ] T022 Create `MusicDexPage.js` in `frontend/src/pages/`.
- [ ] T023 Integrate the new components and services to create the MusicDex feature.

## Dependencies
- T001 must be done before T010.
- T002 must be done before T009.
- Backend tests (T003-T008) must be done before backend implementation (T009-T016).
- T009 must be done before T011.
- T010 and T011 must be done before T012-T016.
- Frontend implementation depends on the backend being complete.

## Parallel Example
```
# Launch backend contract tests in parallel:
Task: "T003 [P] Create contract test for POST /api/music/cds in backend/tests/contract/add_cd.test.js"
Task: "T004 [P] Create contract test for GET /api/music/cds/{id} in backend/tests/contract/get_cd.test.js"
Task: "T005 [P] Create contract test for PUT /api/music/cds/{id} in backend/tests/contract/update_cd.test.js"
Task: "T006 [P] Create contract test for DELETE /api/music/cds/{id} in backend/tests/contract/delete_cd.test.js"
Task: "T007 [P] Create contract test for GET /api/music/search in backend/tests/contract/search_cds.test.js"
```