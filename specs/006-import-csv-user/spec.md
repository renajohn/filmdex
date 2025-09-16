# Feature Specification: CSV Import

**Feature Branch**: `006-import-csv-user`  
**Created**: 2025-09-13
**Status**: Draft  
**Input**: User description: "import csv - user can upload a CVS. The CSV size is limited based on a property. The CVS is replacing Google spreadsheet. Columns that are required are title, optional columns are original title, comments, price, format. During the movie import process, only movies not in the DB are added. All CVS entries are first enriched by using TMDB and OMDB to have all the DB properties then added as a new movie. As user upload the CVS file, the backend process the list and return all the movies it cannot auto-fill. User can work through this list and provide either all information or a suitable original title that will make it findable. To do that, user uses the Add/Edit form. The auto-fill will take the original title or the title to try to find the right movie. Make sure the poster is displayed in that view to simplify the user confirmation. At the end of the process, all movies in the csv should be part of the DB collection."

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
As a user, I want to import my movie collection from a CSV file, so I can easily add multiple movies at once and manage my collection efficiently.

### Acceptance Scenarios
1. **Given** I am on the import page, **When** I upload a valid CSV file with movie titles, **Then** the system processes the file and adds new movies to my collection.
2. **Given** A valid CSV file, **When** I start the import, **Then** the system reads the CSV file and let me map the CSV columns to the expected column names.
3. **Given** a movie from the CSV already exists in my database, **When** I import the CSV, **Then** the existing movie is not duplicated.
4. **Given** the system cannot automatically find a match for a movie in the CSV in TMDB, **When** the import process is complete, **Then** I am presented with a list of unmatched movies to resolve manually.
5. **Given** I am resolving an unmatched movie, **When** I enter a more specific title and search again, **Then** the system displays potential matches with posters for me to confirm.
6. **Given** I have resolved all unmatched movies, **When** I finish the import process, **Then** all movies from the CSV are present in my database collection.

### Edge Cases
- What happens if the user uploads a file that is not a CSV?
 - the system returns an error
- What happens if the user cannot find a more specific title?
  - user can decide to skip any movie that cannot be matched on TMDB
- What happens if the CSV file exceeds the size limit?
- What happens if the required 'title' column is missing from the CSV?
  - System will use the origninal name first, then fallback to title. If none are provided, the movie will be skipped.
- How does the system handle a CSV with no movie entries?
  - returns an error, no movie found
- What happens if the external APIs (TMDB/OMDB) are unavailable during the enrichment process?
  - return an error to inform user.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: The system MUST allow users to upload a CSV file.
- **FR-002**: The system MUST enforce a size limit on uploaded CSV files in code. 
- **FR-003**: The system MUST replace the existing Google Spreadsheet import functionality with the new CSV import.
- **FR-004**: The system MUST parse CSV files with a required 'title' column and optional 'original title', 'comments', 'price', 'acquired_date' and 'format' columns.
- **FR-005**: The system MUST only import movies that do not already exist in the database.
- **FR-006**: The system MUST enrich the data for each movie from the CSV using TMDB and OMDB at the time of import.
- **FR-007**: The system MUST provide a user interface for manually resolving movies that could not be automatically matched.
- **FR-008**: The manual resolution interface MUST display movie posters to assist with confirmation.
- **FR-009**: The system MUST allow users to use the Add/Edit form to correct or provide details for unmatched movies.
- **FR-010**: By the end of the import process, all movies from the CSV MUST be added to the user's collection.
- **FR-011**: The system MUST handle cases where external movie databases (TMDB, OMDB) do not have information for a given title.
- **FR-012**: The system MUST allow user to provide a mapping between their CSV column name and the expected column name.
- **FR-013**: The system MUST have a way to keep track of all movies imported on a given movie import requests.

### Key Entities *(include if feature involves data)*
- **Movie Import**: Represents a single import session initiated by a user uploading a CSV.
    - **Attributes**:
        - `import_id`
        - `status` (e.g., pending, processing, completed, failed)
        - `unmatched_movies` (list of movies requiring manual intervention)
- **Movie**: Represents a single movie in the user's collection.
    - **Attributes**:
        - `title`
        - `original_title`
        - `comments`
        - `price`
        - `acquired_date`
        - `format`
        - (and other existing movie attributes)

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [ ] No implementation details (languages, frameworks, APIs)
- [ ] Focused on user value and business needs
- [ ] Written for non-technical stakeholders
- [ ] All mandatory sections completed

### Requirement Completeness
- [ ] No [NEEDS CLARIFICATION] markers remain
- [ ] Requirements are testable and unambiguous  
- [ ] Success criteria are measurable
- [ ] Scope is clearly bounded
- [ ] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [ ] User description parsed
- [ ] Key concepts extracted
- [ ] Ambiguities marked
- [ ] User scenarios defined
- [ ] Requirements generated
- [ ] Entities identified
- [ ] Review checklist passed