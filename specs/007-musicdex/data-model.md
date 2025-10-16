# Data Model for MusicDex

This document describes the database schema for the MusicDex feature.

## Tables

### `cds`

This table stores the main information about each CD.

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` | Primary key. |
| `artist` | `varchar(255)` | The artist of the CD. |
| `title` | `varchar(255)` | The title of the CD. |
| `release_year` | `integer` | The year the CD was released. |
| `labels` | `varchar(255)[]` | The labels of the CD. |
| `catalog_number` | `varchar(255)` | The catalog number of the CD. |
| `barcode` | `varchar(255)` | The barcode of the CD. |
| `country` | `varchar(255)` | The country of release. |
| `edition_notes` | `text` | Notes about the specific edition. |
| `genres` | `varchar(255)[]` | The genres of the CD. |
| `moods` | `varchar(255)[]` | The moods of the CD. |
| `recording_quality` | `varchar(255)` | The quality of the recording. |
| `cover_path` | `varchar(255)` | The path to the local cover image. |
| `musicbrainz_release_id` | `uuid` | The MusicBrainz release ID. |
| `condition` | `varchar(255)` | The condition of the CD. |
| `purchase_notes` | `text` | Notes about the purchase. |
| `purchased_at` | `date` | The date the CD was purchased. |
| `price_chf` | `decimal` | The price of the CD in CHF. |
| `created_at` | `timestamp` | The timestamp when the record was created. |
| `updated_at` | `timestamp` | The timestamp when the record was last updated. |

### `tracks`

This table stores the tracks for each CD.

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` | Primary key. |
| `cd_id` | `uuid` | Foreign key to the `cds` table. |
| `disc_number` | `integer` | The disc number. |
| `track_number` | `integer` | The track number. |
| `title` | `varchar(255)` | The title of the track. |
| `duration_sec` | `integer` | The duration of the track in seconds. |
| `created_at` | `timestamp` | The timestamp when the record was created. |
| `updated_at` | `timestamp` | The timestamp when the record was last updated. |
