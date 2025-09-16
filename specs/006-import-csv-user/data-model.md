# Data Model: CSV Import

## New Entities

### MovieImport
Represents a single import session initiated by a user uploading a CSV.

- `id` (UUID, Primary Key): Unique identifier for the import session.
- `status` (TEXT): The current status of the import (e.g., `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
- `createdAt` (DATETIME): Timestamp when the import was created.
- `updatedAt` (DATETIME): Timestamp when the import was last updated.

## Modified Entities

### Movie
The existing movie entity will be updated to include a reference to the import session.

- `importId` (UUID, Foreign Key to MovieImport.id): The ID of the import session that this movie was created in. This can be null if the movie was not created via an import.
