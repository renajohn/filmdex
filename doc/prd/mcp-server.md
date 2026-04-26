# PRD — MCP Server pour DexVault

## Problem Statement

L'utilisateur possède une collection physique de films, albums et livres gérée dans DexVault, mais consulter cette collection passe aujourd'hui exclusivement par l'interface web. Quand il veut prendre une décision contextuelle — par exemple « quel film léger regarder ce soir avec mes filles de 12 et 15 ans, qu'on n'a pas vu récemment et qui dure moins de 2 heures ? » — il doit ouvrir l'app, appliquer manuellement plusieurs filtres, croiser mentalement les critères d'âge, de durée, de genre et de l'historique de visionnage. Pour des questions plus larges (« combien de Blu-ray j'ai par genre ? », « quels livres de cet auteur me reste-t-il à lire ? »), l'agrégation doit être faite à la main.

Avec l'usage croissant de Claude (Code, Desktop) au quotidien, l'utilisateur veut pouvoir poser ces questions en langage naturel à un assistant qui a un accès direct et structuré à sa collection, plutôt que de naviguer dans une UI.

## Solution

Exposer DexVault comme un serveur **MCP (Model Context Protocol)** en lecture seule, embarqué dans le backend Express existant et accessible via Traefik à `https://dexvault-mcp.lab.crog.org/`. Le serveur expose un jeu de tools MCP typés (recherches par type de média avec filtres riches, accès au détail d'un item, statistiques, wishlist) que Claude peut appeler pour répondre à des questions sur la collection. Le serveur n'est accessible que sur le réseau local de l'utilisateur — pas d'authentification.

Le format de sortie par défaut est Markdown (lisible et performant pour les LLMs récents), avec une option JSON pour les cas où Claude doit chaîner les appels. Les détails (`get_*`) sont toujours en JSON.

## User Stories

1. As a DexVault user, I want to ask Claude « quoi regarder ce soir avec mes filles de 12-15 ans, quelque chose de léger qu'on n'a pas vu récemment », so that I get a curated list without manually filtering my collection.
2. As a DexVault user, I want to ask Claude « ai-je ce livre de Murakami dans ma collection ? », so that I avoid acheter un duplicata avant de commander.
3. As a DexVault user, I want Claude to recommend a movie based on my collection and a constraint (« j'ai 90 minutes »), so that I get a fast, contextual suggestion.
4. As a DexVault user, I want Claude to answer « combien de Blu-ray j'ai dans la collection ? » without me opening analytics.
5. As a DexVault user, I want Claude to list my wishlist items by type, so that I can prepare a shopping list.
6. As a DexVault user, I want Claude to find movies I own by a specific director ou actor, so that I rediscover what I already have.
7. As a DexVault user, I want Claude to filter by IMDB rating threshold (`min_imdb`), so that I narrow down quality picks.
8. As a DexVault user, I want Claude to filter by maximum age recommendation, so that recommendations are family-appropriate.
9. As a DexVault user, I want Claude to filter movies by `watched: false`, so that I focus on titles I haven't seen yet.
10. As a DexVault user, I want Claude to retrieve full details (plot, cast, comments) of a movie/album/book by ID, so that I can ask follow-up questions on a specific item.
11. As a DexVault user, I want Claude to find albums by artist or genre, so that I plan listening sessions.
12. As a DexVault user, I want Claude to find books by author or genre, with the read/unread filter, so that I pick my next read.
13. As a DexVault administrator, I want the MCP server to share the existing Docker container and deployment, so that I have no extra service to maintain or update.
14. As a DexVault administrator, I want the MCP endpoint to live behind Traefik with a dedicated subdomain, so that the routing is clean and TLS is automatic.
15. As a DexVault administrator, I want the MCP server to be local-network-only, so that my collection is not exposed publicly.
16. As a DexVault administrator, I want the MCP code organized in `backend/src/mcp/` with one file per tool, so that adding/removing tools is trivial.
17. As a Claude Code user, I want to register the MCP server once with `--scope user`, so that it is available across all my projects without per-project setup.
18. As a Claude Desktop user, I want to add the MCP server via the standard config file, so that the integration is consistent with other MCP servers.
19. As a developer, I want each tool's input schema to be expressed in zod, so that validation is automatic and type-safe.
20. As a developer, I want the result formatters (Markdown/JSON) to be a deep, isolated module, so that I can unit-test rendering without spinning up Express.
21. As a developer, I want filter normalization (typed input → DexVault search criteria) to be a deep, isolated module, so that I can verify many filter combinations in unit tests.
22. As a developer, I want compact projections (full row → list-friendly subset) to be pure functions, so that they are trivially testable.
23. As a developer, I want a `safeToolHandler` wrapper to catch exceptions and convert them to MCP error responses, so that tool failures don't crash the server.
24. As a Claude consumer, I want search results to include `id` as the first column, so that I can chain a `get_*` call without ambiguity.
25. As a Claude consumer, I want search responses to include `total_count` and `truncated` flags, so that I know when to refine my query.
26. As a Claude consumer, I want a default `limit` of 20 and a max of 100, so that the response stays within a reasonable token budget.
27. As a Claude consumer, I want a `format` parameter on `search_*` tools (`markdown` | `json`, default `markdown`), so that I can request raw JSON when chaining is needed.
28. As an operator, I want each MCP tool call to be logged (name, input summary, duration, result size), so that I can monitor usage and debug.
29. As an operator, I want no CORS configuration (since MCP HTTP clients are not browsers), so that the surface stays minimal.
30. As an operator, I want the MCP transport to run in stateless mode initially, so that there is no session state to manage.

## Implementation Decisions

### Architecture and topology

- The MCP server is **embedded in the existing Express backend** (no new Docker service). It mounts at `POST /mcp` on the backend (port 3001).
- A new Traefik router routes `Host(dexvault-mcp.lab.crog.org)` to the existing `dexvault` service, with an `addPrefix=/mcp` middleware so that the client connects to `https://dexvault-mcp.lab.crog.org/` (root) and the backend receives `/mcp`.
- The transport uses the official MCP TypeScript SDK's `StreamableHTTPServerTransport` in **stateless mode** (each request is independent, no session IDs, no SSE).
- No authentication. Access is restricted by the local-only resolution of `*.lab.crog.org`.
- TLS is handled by the existing Traefik certificate setup (assumed wildcard or per-host auto-resolved); to verify on first deployment.

### Module decomposition

The backend gains a new `mcp/` subtree organized into deep, testable modules and thinner orchestration layers:

- **Deep modules (extracted, isolated, unit-tested)**:
  - **Result formatters** — convert lists/objects into Markdown tables or JSON `content`. Encapsulate column selection, table generation, truncation indicators, and `total_count`/`truncated` flags. Stable interface, format-agnostic.
  - **Filter normalizers** — one per media type. Convert MCP-typed input (e.g. `{ genre, max_age, watched }`) into the existing search service's expected query string and criteria. Encapsulate the mapping from MCP-flat schema to DexVault's `SearchFilters` parser language.
  - **Compact projectors** — pure functions that pick the ~10 list-relevant fields from a full row (`MovieRow`, `AlbumRow`, `BookRow`).

- **Thinner modules (orchestration / glue)**:
  - **MCP server registry** — creates the `McpServer` instance, registers all tools.
  - **Express transport mount** — wires `StreamableHTTPServerTransport` into Express at `/mcp`.
  - **Per-tool handlers** — thin wrappers: validate input via zod → call filter normalizer → call existing service → call compact projector → call formatter → return MCP content.
  - **Safe handler wrapper** — try/catch around each handler, log via existing `logger.ts`, produce `{ isError: true }` content on failure.

### Tools exposed (MVP — 8 tools)

1. **`search_movies`** — input: `{ query?, genre?, director?, format?, year_min?, year_max?, max_age?, min_imdb?, runtime_max?, watched?, limit?, format? }`. Output: list (Markdown table by default, JSON opt-in) with `id`, `title`, `director`, `release_year`, `genre`, `format`, `runtime`, `recommended_age`, `imdb_rating`, `watched`, `last_watched`. Includes `total_count` and `truncated`.
2. **`search_albums`** — input: `{ query?, artist?, genre?, format?, year_min?, year_max?, limit?, format? }`. Output: list with the equivalent compact album fields.
3. **`search_books`** — input: `{ query?, author?, genre?, read?, limit?, format? }`. Output: list with the equivalent compact book fields. The `read` filter maps to the existing read-tracking field.
4. **`get_movie`** — input: `{ id }`. Output: full movie detail in JSON (all fields including plot, cast, crew, comments, posters, links to box sets / collections).
5. **`get_album`** — input: `{ id }`. Output: full album detail in JSON.
6. **`get_book`** — input: `{ id }`. Output: full book detail in JSON (including comments).
7. **`get_collection_stats`** — no input. Output: counters by type, format, genre across the whole collection.
8. **`list_wishlist`** — input: `{ type?, limit?, format? }` where `type ∈ {movie, album, book}` (omitted = all types). Output: items with `title_status='wish'` aggregated across the relevant tables.

### Schema and contract decisions

- **Default `limit` = 20**, **max `limit` = 100** for all `search_*` and `list_*` tools.
- **`format` parameter** on `search_*` and `list_wishlist`: `"markdown" | "json"`, default `"markdown"`.
- **`get_*` tools** always return JSON (structured detail, not tabular).
- **`id` is always the first column** of any Markdown table, so chaining a `get_*` call is unambiguous.
- **Truncation**: when matching items > `limit`, the response includes `total_count` (number of all matches) and `truncated: true` so Claude can refine.
- **No cursor/offset pagination** in MVP (KISS). If Claude needs more, it refines the query.
- **Wishlist** is implemented by filtering existing tables on `title_status='wish'`, not via a dedicated table.

### Validation, errors, and logging

- All tool inputs validated via **zod** schemas registered with the SDK; invalid inputs return MCP validation errors before reaching the handler.
- All handlers wrapped by `safeToolHandler` which catches exceptions, logs them via the existing `logger.ts`, and converts them to MCP `{ isError: true, content: [{ type: "text", text: ... }] }` responses.
- Each tool call is logged with: tool name, validated input (no secrets), duration, result item count or byte size. Result content itself is **not** logged (can be large).
- No CORS middleware on `/mcp` (HTTP MCP clients are not browsers and do not preflight).

### Deployment

- **`docker-compose.yml`**: add Traefik labels for a new router `dexvault-mcp` matching `Host(dexvault-mcp.lab.crog.org)`, pointing to the existing `dexvault` service, with a middleware `addprefix.prefix=/mcp`. No `homepage.*` labels for this router (it is not a UI).
- **DNS**: assumes `*.lab.crog.org` already resolves to the local network (wildcard or specific record to add).
- **No new environment variables** required (no auth token).

### Client configuration

- **Claude Code** (recommended primary): `claude mcp add --transport http --scope user dexvault https://dexvault-mcp.lab.crog.org/`.
- **Claude Desktop**: edit `~/Library/Application Support/Claude/claude_desktop_config.json` to add the server with `"type": "http"`, then restart.
- **Claude.ai (web)**: out of scope — local-only network not reachable from Anthropic cloud.

## Testing Decisions

### What makes a good test in this codebase

Tests should verify **external behavior** (inputs in, outputs out) rather than implementation details. For pure modules (formatters, filter normalizers, projectors) this means asserting on the returned string/object given a known input. For tool integration tests this means invoking the MCP server through its public client surface and asserting on the resulting `content`. Tests must not lock themselves to internal helper signatures, intermediate field names, or the precise SQL emitted by services.

The backend currently uses **Jest** (with `supertest` for HTTP-level integration tests). The frontend uses Vitest, but MCP code is backend-only.

### Modules to test

The three deep modules are the priority for unit tests because they encapsulate non-trivial logic with stable interfaces:

- **Result formatters** (`mcp/format/`):
  - Markdown table generation: header order, `id` first, alignment, empty list handling.
  - JSON output: shape, field selection, no extra fields.
  - Truncation footer / metadata in both formats.
  - Behavior when a column value is `null` (rendered as empty cell or `—`).

- **Filter normalizers** (`mcp/filters/`):
  - Each typed filter (`max_age`, `genre`, `year_min/max`, `watched`, `min_imdb`, `runtime_max`, etc.) maps to the correct DexVault query string fragment or criteria field.
  - Combinations: multiple filters compose correctly without conflict.
  - Empty input produces an empty/no-op query.
  - The free-text `query` field is preserved alongside typed filters.
  - One normalizer per media type (movies, albums, books) with parallel test files.

- **Compact projectors** (`mcp/projections/`):
  - Each projector picks exactly the documented compact field set.
  - Derived fields (e.g. `watched: boolean` from `watch_count > 0`, `release_year` from `release_date`) are computed correctly.
  - `null` and missing fields are handled without throwing.

### Integration tests

- **One end-to-end test per tool** that mounts the `McpServer` in memory, invokes the tool through the MCP TypeScript SDK's in-process client transport, and asserts on the returned content.
- Tests run against a **fixture SQLite DB** (either an in-memory database seeded in `beforeEach`, or a small fixture file in `backend/tests/fixtures/`) — not against the production `data/db.sqlite`.
- Pattern aligns with existing `backend/tests/integration/` and `backend/tests/contract/`.

### Out of scope for testing

- HTTP-layer tests (Express + StreamableHTTPServerTransport wiring) — covered transitively by the SDK's own test suite; we trust the official transport.
- Traefik routing — verified manually at deployment time.
- Performance/load tests — not needed for a single-user, local-network MCP server.

## Out of Scope

- **Write operations** (add/edit/delete movies/albums/books, mark as watched/read, manage collections). Read-only MVP only; write tools will be a future PRD if/when needed.
- **Smart playlist / recommendation tools** that go beyond plain search (e.g. exposing `smartPlaylistService` directly). Claude can already recommend on top of search results; deeper integration is a future step.
- **Import / backfill / backup tools**. Maintenance tasks remain in the existing UI.
- **Authentication** (bearer token, OAuth). Not needed for a local-only deployment.
- **Public exposure** (claude.ai compatibility). Would require auth and is explicitly excluded.
- **Stateful transport / SSE / progress notifications**. Stateless HTTP suffices for sub-second search operations; can be revisited if long-running operations are added later.
- **Cursor-based pagination**. Refining queries is preferred for MVP.
- **Per-tool rate limiting**. Not needed at single-user scale.
- **Homepage tile** for the MCP endpoint. Not a UI.

## Further Notes

- **Dependency to add**: `@modelcontextprotocol/sdk` and `zod` (if not already in the backend). Check existing `backend/package.json` first.
- **Mount order in `backend/index.ts`**: the MCP router should be mounted before the static file handler and after `cors`/`express.json`. The MCP transport reads the request body itself, so the ordering with `express.json` must be verified per SDK guidance (some SDK versions require raw body — consult the latest SDK docs at implementation time).
- **DNS verification**: at deploy time, confirm `dexvault-mcp.lab.crog.org` resolves correctly on the local network and that Traefik picks up the new router.
- **Future evolution paths** (out of scope but anticipated):
  - Add write tools (mark as watched, add to wishlist) once the read flow is stable.
  - Add a `recommend_movie` tool wrapping `smartPlaylistService` for richer suggestions.
  - Add OAuth + public exposure if the user wants claude.ai access.
