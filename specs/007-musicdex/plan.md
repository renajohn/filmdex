# Implementation Plan: MusicDex

**Branch**: `007-musicdex` | **Date**: 2025-10-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-musicdex/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, or `GEMINI.md` for Gemini CLI).
6. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
The MusicDex feature will introduce a new section for managing a user's CD collection, similar to the existing FilmDex. The implementation will involve creating a new tab in the frontend, and new API endpoints in the backend for adding, editing, and searching for CDs. The backend will use MusicBrainz and Cover Art Archive for data, and will store CD and track information in separate database tables.

## Technical Context
**Language/Version**: Node.js (backend, assumed LTS), React 19.1.1 (frontend)
**Primary Dependencies**: Express 5.1.0, Knex, React, musicbrainz-api
**Storage**: SQL Database (e.g., SQLite, PostgreSQL)
**Testing**: Jest
**Target Platform**: Web Browser
**Project Type**: Web application (frontend + backend)
**Performance Goals**: API response time < 500ms
**Constraints**: N/A
**Scale/Scope**: Single user, collections up to 10,000 items.

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (backend, frontend)
- Using framework directly? Yes
- Single data model? No, CD and Track will be separate.
- Avoiding patterns? Yes

**Architecture**:
- EVERY feature as library? No, this will be integrated into the existing application.
- Libraries listed: N/A
- CLI per library: N/A
- Library docs: N/A

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes
- Git commits show tests before implementation? Yes
- Order: Contract→Integration→E2E→Unit strictly followed? Yes
- Real dependencies used? Yes
- Integration tests for: new libraries, contract changes, shared schemas? Yes
- FORBIDDEN: Implementation before test, skipping RED phase. Yes

**Observability**:
- Structured logging included? Yes
- Frontend logs → backend? Yes
- Error context sufficient? Yes

**Versioning**:
- Version number assigned? Yes
- BUILD increments on every change? Yes
- Breaking changes handled? Yes

## Project Structure

### Documentation (this feature)
```
specs/007-musicdex/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/
```

**Structure Decision**: Option 2: Web application

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - Research Node.js and React versions.
   - Define performance goals, constraints, and scale.
   - Clarify observability and versioning strategies.

2. **Generate and dispatch research agents**:
   ```
   Task: "Research musicbrainz-api library for Node.js"
   Task: "Find best practices for integrating a new section into a React application"
   ```

3. **Consolidate findings** in `research.md`

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Create `cd` and `track` tables.

2. **Generate API contracts** from functional requirements:
   - `POST /api/music/cds`
   - `GET /api/music/cds/{id}`
   - `PUT /api/music/cds/{id}`
   - `DELETE /api/music/cds/{id}`
   - `GET /api/music/search?q={query}`

3. **Generate contract tests** from contracts.

4. **Extract test scenarios** from user stories.

5. **Update agent file incrementally**.

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Generate tasks for creating the database schema, backend API endpoints, and frontend components.

**Ordering Strategy**:
- Backend first: database, then services, then API.
- Frontend second: services, then components, then pages.

**Estimated Output**: ~20 tasks in tasks.md

## Complexity Tracking
| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| | | |

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [ ] Complexity deviations documented

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*