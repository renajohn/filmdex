# Implementation Plan: Movie Collection App

**Branch**: `002-create-an-simple` | **Date**: 2025-09-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-create-an-simple/spec.md`

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
**Primary Requirement**: Create a web application for managing physical movie collections with secure Google Sheets import and multi-criteria search capabilities.

**Technical Approach**: 
- React frontend with OAuth2 authentication flow for Google Sheets access
- Express.js backend with SQLite database for local storage
- Google Sheets API integration with OAuth2 for secure private sheet access
- Multi-criteria search functionality with responsive UI
- IMDB/OMDB API integration for automatic rating retrieval
- Manual movie entry form with validation
- Movie editing capabilities with form pre-population
- CSV export functionality
- Google Sheets export with OAuth2 authentication
- Column mapping interface for flexible Google Sheets import

## Technical Context
**Language/Version**: Node.js for backend, React for frontend
**Primary Dependencies**: Express.js, React, Google APIs (OAuth2), SQLite3, CORS, OMDB API, CSV export libraries
**Storage**: SQLite with local database file
**Authentication**: Google OAuth2 for Google Sheets API access
**Testing**: Jest for backend, React Testing Library for frontend
**Target Platform**: Web browser
**Project Type**: Web application (frontend + backend)
**Performance Goals**: <2s import time for 1000 movies, <500ms search response time
**Constraints**: OAuth2 token management, popup-based authentication flow
**Scale/Scope**: Single-user application, personal movie collection management

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (frontend, backend) - within limit
- Using framework directly? Yes - Express.js and React used directly
- Single data model? Yes - Movie entity only
- Avoiding patterns? Yes - direct database access, no unnecessary abstractions

**Architecture**:
- EVERY feature as library? No - direct app implementation for simplicity
- Libraries listed: N/A - using standard frameworks directly
- CLI per library: N/A - web application only
- Library docs: N/A - standard framework documentation used

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes - tests written first
- Git commits show tests before implementation? Yes - test-driven development
- Order: Contract→Integration→E2E→Unit strictly followed? Yes - API contracts first
- Real dependencies used? Yes - SQLite database, Google APIs
- Integration tests for: OAuth2 flow, Google Sheets API, database operations
- FORBIDDEN: Implementation before test, skipping RED phase - followed

**Observability**:
- Structured logging included? Yes - console logging with error context
- Frontend logs → backend? No - client-side error handling
- Error context sufficient? Yes - detailed error messages and stack traces

**Versioning**:
- Version number assigned? Yes - 1.0.0
- BUILD increments on every change? Yes - semantic versioning
- Breaking changes handled? Yes - API versioning and backward compatibility

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

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

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: Option 2: Web application

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `/scripts/update-agent-context.sh [claude|gemini|copilot]` for your AI assistant
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from the `plan.md` file.
- Create tasks for each step in the `Execution Flow` of the `plan.md` file.

**Ordering Strategy**:
- Tasks will be ordered based on the `Execution Flow` in the `plan.md` file.

**Estimated Output**: 10-15 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [x] Phase 3: Tasks generated (/tasks command)
- [x] Phase 4: Core implementation complete
- [x] Phase 5: Core validation passed
- [x] Phase 6: Enhanced features implementation (FR-009 to FR-014)
- [x] Phase 7: Enhanced features validation
- [x] Phase 8: Column mapping implementation (FR-015)
- [ ] Phase 9: Column mapping validation

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*