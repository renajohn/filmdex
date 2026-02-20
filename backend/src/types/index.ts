/**
 * Domain types for DexVault backend.
 * These types represent the data structures used across models, services, and controllers.
 */

import type { Request, Response, NextFunction } from 'express';
import type { Database, RunResult } from 'sqlite3';

// ============================================================
// Database helpers
// ============================================================

/** sqlite3 callback-style Database instance */
export type SqliteDatabase = Database;

/** Generic row returned by sqlite3 queries (unknown shape) */
export type SqliteRow = Record<string, unknown>;

// ============================================================
// Configuration
// ============================================================

export interface DeploymentConfig {
  data_path: string;
  platform: string;
  deployment: string;
  port?: number;
}

export interface DataConfig {
  log_level: string;
  omdb_api_key: string;
  tmdb_api_key: string;
  max_upload_mb: number;
  [key: string]: unknown;
}

export interface ApiKeys {
  omdb: string;
  tmdb: string;
}

// ============================================================
// Movie domain
// ============================================================

export interface MovieRow {
  id: number;
  title: string | null;
  original_title: string | null;
  original_language: string | null;
  genre: string | null;
  director: string | null;
  cast: string | null;
  release_date: string | null;
  format: string | null;
  imdb_rating: number | null;
  rotten_tomato_rating: number | null;
  rotten_tomatoes_link: string | null;
  tmdb_rating: number | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  price: number | null;
  runtime: number | null;
  plot: string | null;
  comments: string | null;
  never_seen: boolean | null;
  acquired_date: string | null;
  import_id: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  budget: number | null;
  revenue: number | null;
  trailer_key: string | null;
  trailer_site: string | null;
  status: string | null;
  popularity: number | null;
  vote_count: number | null;
  adult: boolean | null;
  video: boolean | null;
  media_type: string | null;
  recommended_age: number | null;
  age_processed: boolean | null;
  title_status: string | null;
  last_watched: string | null;
  watch_count: number | null;
  // Joined fields
  collection_order?: number | null;
  box_set_collections?: string | null;
  user_collections?: string | null;
}

export interface MovieData {
  id?: number;
  title: string | null;
  original_title: string | null;
  original_language: string | null;
  genre: string | null;
  director: string | null;
  cast: unknown[] | string | null;
  release_date: string | null;
  format: string | null;
  imdb_rating: number | null;
  rotten_tomato_rating: number | null;
  rotten_tomatoes_link: string | null;
  tmdb_rating: number | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  price: number | null;
  runtime: number | null;
  plot: string | null;
  comments: string | null;
  never_seen: boolean | null;
  acquired_date: string | null;
  import_id: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  budget: number | null;
  revenue: number | null;
  trailer_key: string | null;
  trailer_site: string | null;
  status: string | null;
  popularity: number | null;
  vote_count: number | null;
  adult: boolean | null;
  video: boolean | null;
  media_type?: string;
  recommended_age: number | null;
  age_processed?: boolean;
  title_status?: string;
  last_watched?: string | null;
  watch_count?: number;
  // Computed fields from findAll/search
  has_box_set?: boolean;
  box_set_name?: string | null;
  collection_names?: string[];
}

export interface MovieSearchCriteria {
  searchText?: string;
  format?: string;
  year?: string | number;
  title_status?: string;
}

export interface MovieUpdateResult {
  id: number;
  changes: number;
}

export interface MovieWatchResult {
  id: number;
  last_watched: string | null;
  watch_count: number;
  never_seen?: boolean;
  changes: number;
}

// ============================================================
// Album domain
// ============================================================

export interface AlbumRow {
  id: number;
  artist: string;
  title: string;
  release_year: number | null;
  labels: string | null;
  catalog_number: string | null;
  barcode: string | null;
  country: string | null;
  edition_notes: string | null;
  genres: string | null;
  moods: string | null;
  tags: string | null;
  rating: number | null;
  total_duration: number | null;
  format: string | null;
  packaging: string | null;
  status: string | null;
  release_events: string | null;
  recording_quality: string | null;
  cover: string | null;
  back_cover: string | null;
  musicbrainz_release_id: string | null;
  musicbrainz_release_group_id: string | null;
  release_group_first_release_date: number | null;
  release_group_type: string | null;
  release_group_secondary_types: string | null;
  condition: string | null;
  ownership_notes: string | null;
  purchased_at: string | null;
  price_chf: number | null;
  producer: string | null;
  engineer: string | null;
  recording_location: string | null;
  language: string | null;
  urls: string | null;
  isrc_codes: string | null;
  annotation: string | null;
  title_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlbumFormatted {
  id: number;
  artist: string[];
  title: string;
  releaseYear: number | null;
  labels: string[];
  catalogNumber: string | null;
  barcode: string | null;
  country: string | null;
  editionNotes: string | null;
  genres: string[];
  moods: string[];
  tags: string[];
  rating: number | null;
  totalDuration: number | null;
  format: string | null;
  packaging: string | null;
  status: string | null;
  releaseEvents: unknown[];
  recordingQuality: string | null;
  cover: string | null;
  backCover: string | null;
  musicbrainzReleaseId: string | null;
  musicbrainzReleaseGroupId: string | null;
  releaseGroupFirstReleaseDate: number | null;
  releaseGroupType: string | null;
  releaseGroupSecondaryTypes: string[];
  ownership: {
    condition: string | null;
    notes: string | null;
    purchasedAt: string | null;
    priceChf: number | null;
  };
  producer: string[];
  engineer: string[];
  recordingLocation: string | null;
  language: string | null;
  urls: Record<string, string>;
  isrcCodes: string[];
  annotation: string | null;
  titleStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumCreateData {
  artist?: string[];
  title: string;
  releaseYear?: number | null;
  labels?: string[];
  catalogNumber?: string | null;
  barcode?: string | null;
  country?: string | null;
  editionNotes?: string | null;
  genres?: string[];
  tags?: string[];
  rating?: number | null;
  totalDuration?: number | null;
  format?: string | null;
  packaging?: string | null;
  status?: string | null;
  releaseEvents?: unknown[];
  recordingQuality?: string | null;
  cover?: string | null;
  backCover?: string | null;
  musicbrainzReleaseId?: string | null;
  musicbrainzReleaseGroupId?: string | null;
  releaseGroupFirstReleaseDate?: number | null;
  releaseGroupType?: string | null;
  releaseGroupSecondaryTypes?: string[];
  ownership?: {
    condition?: string | null;
    notes?: string | null;
    purchasedAt?: string | null;
    priceChf?: number | null;
  };
  producer?: string[];
  engineer?: string[];
  recordingLocation?: string | null;
  language?: string | null;
  urls?: Record<string, string | null>;
  isrcCodes?: string[];
  annotation?: string | null;
  titleStatus?: string;
}

export interface AlbumSearchParsed {
  params: unknown[];
  whereClauses: string[];
  hasFilters: boolean;
  hasTrackFilter: boolean;
  cleanedQuery: string;
}

// ============================================================
// Track domain
// ============================================================

export interface TrackRow {
  id: number;
  album_id: number;
  disc_number: number;
  track_number: number;
  title: string;
  duration_sec: number | null;
  isrc: string | null;
  musicbrainz_recording_id: string | null;
  musicbrainz_track_id: string | null;
  toc: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackFormatted {
  id: number;
  cdId: number;
  albumId: number;
  discNumber: number;
  trackNumber: number;
  title: string;
  durationSec: number | null;
  isrc: string | null;
  musicbrainzRecordingId: string | null;
  musicbrainzTrackId: string | null;
  toc: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackCreateData {
  cdId?: number;
  albumId?: number;
  discNumber?: number;
  trackNumber: number;
  title: string;
  durationSec?: number | null;
  isrc?: string | null;
  musicbrainzRecordingId?: string | null;
  musicbrainzTrackId?: string | null;
  toc?: string | null;
}

// ============================================================
// Book domain
// ============================================================

export interface BookRow {
  id: number;
  isbn: string | null;
  isbn13: string | null;
  title: string;
  subtitle: string | null;
  authors: string | null;
  artists: string | null;
  publisher: string | null;
  published_year: number | null;
  language: string | null;
  format: string | null;
  filetype: string | null;
  drm: string | null;
  narrator: string | null;
  runtime: number | null;
  series: string | null;
  series_number: number | null;
  genres: string | null;
  tags: string | null;
  rating: number | null;
  cover: string | null;
  owner: string | null;
  read_date: string | null;
  page_count: number | null;
  description: string | null;
  urls: string | null;
  annotation: string | null;
  ebook_file: string | null;
  title_status: string | null;
  book_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookFormatted {
  id: number;
  isbn: string | null;
  isbn13: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  artists: string[];
  publisher: string | null;
  publishedYear: number | null;
  language: string | null;
  format: string | null;
  filetype: string | null;
  drm: string | null;
  narrator: string | null;
  runtime: number | null;
  series: string | null;
  seriesNumber: number | null;
  genres: string[];
  tags: string[];
  rating: number | null;
  cover: string | null;
  owner: string | null;
  readDate: string | null;
  pageCount: number | null;
  description: string | null;
  urls: Record<string, string>;
  annotation: string | null;
  ebookFile: string | null;
  titleStatus: string | null;
  bookType: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookCreateData {
  isbn?: string | null;
  isbn13?: string | null;
  title: string;
  subtitle?: string | null;
  authors?: string[];
  artists?: string[];
  publisher?: string | null;
  publishedYear?: number | null;
  language?: string | null;
  format?: string;
  filetype?: string | null;
  drm?: string | null;
  narrator?: string | null;
  runtime?: number | null;
  series?: string | null;
  seriesNumber?: number | null;
  genres?: string[];
  tags?: string[];
  rating?: number | null;
  cover?: string | null;
  owner?: string | null;
  readDate?: string | null;
  pageCount?: number | null;
  description?: string | null;
  urls?: Record<string, string | null>;
  annotation?: string | null;
  ebookFile?: string | null;
  titleStatus?: string;
  bookType?: string;
}

export interface BookSearchParsed {
  params: unknown[];
  whereClauses: string[];
  titleStatusFilter: string | string[] | null;
  hasFilters: boolean;
  cleanedQuery: string;
}

// ============================================================
// Book Comment domain
// ============================================================

export interface BookCommentRow {
  id: number;
  book_id: number;
  name: string;
  comment: string;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface BookCommentFormatted {
  id: number;
  bookId: number;
  name: string;
  comment: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookCommentCreateData {
  bookId: number;
  name: string;
  comment: string;
  date?: string;
}

// ============================================================
// Collection domain
// ============================================================

export interface CollectionRow {
  id: number;
  name: string;
  type: string;
  is_system: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionData {
  id?: number;
  name: string;
  type?: string;
  is_system?: boolean | number;
  created_at?: string;
  updated_at?: string;
}

// ============================================================
// Movie Collection domain
// ============================================================

export interface MovieCollectionRow {
  id: number;
  movie_id: number;
  collection_id: number;
  collection_order: number | null;
  created_at: string;
  collection_name?: string;
  title?: string;
  release_date?: string;
}

export interface MovieCollectionData {
  movie_id: number;
  collection_id: number;
  collection_order: number | null;
}

// ============================================================
// Album Collection domain
// ============================================================

export interface AlbumCollectionRow {
  id: number;
  album_id: number;
  collection_id: number;
  collection_order: number | null;
  created_at: string;
  collection_name?: string;
  title?: string;
  release_year?: number;
}

export interface AlbumCollectionData {
  album_id: number;
  collection_id: number;
  collection_order: number | null;
}

// ============================================================
// Movie Cast / Crew domain
// ============================================================

export interface MovieCastRow {
  id: number;
  movie_id: number;
  tmdb_cast_id: number;
  name: string;
  character: string | null;
  profile_path: string | null;
  local_profile_path: string | null;
  order_index: number | null;
}

export interface MovieCastData {
  movie_id: number;
  tmdb_cast_id: number;
  name: string;
  character?: string | null;
  profile_path?: string | null;
  local_profile_path?: string | null;
  order_index?: number | null;
}

export interface MovieCrewRow {
  id: number;
  movie_id: number;
  tmdb_crew_id: number;
  name: string;
  job: string | null;
  department: string | null;
  profile_path: string | null;
  local_profile_path: string | null;
}

export interface MovieCrewData {
  movie_id: number;
  tmdb_crew_id: number;
  name: string;
  job?: string | null;
  department?: string | null;
  profile_path?: string | null;
  local_profile_path?: string | null;
}

// ============================================================
// Movie Import domain
// ============================================================

export interface MovieImportRow {
  id: string;
  status: string;
  total_movies: number;
  processed_movies: number;
  auto_resolved_movies: number;
  manual_resolved_movies: number;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Unmatched Movie domain
// ============================================================

export interface UnmatchedMovieData {
  import_id: string;
  title: string;
  original_title?: string | null;
  csv_data: Record<string, unknown>;
  error_message?: string | null;
}

export interface UnmatchedMovieFormatted {
  id: string;
  import_id: string;
  title: string;
  original_title: string | null;
  csvData: Record<string, unknown>;
  error: string | null;
}

// ============================================================
// Playlist History domain
// ============================================================

export interface PlaylistHistoryRow {
  id: number;
  album_id: number;
  suggested_at: string;
}

export interface SuggestionCount {
  album_id: number;
  suggestion_count: number;
}

// ============================================================
// Express helpers
// ============================================================

export type ExpressRequest = Request;
export type ExpressResponse = Response;
export type ExpressNextFunction = NextFunction;

/** Express route handler */
export type RouteHandler = (req: Request, res: Response, next?: NextFunction) => void | Promise<void>;

/** Express error handler */
export type ErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => void;

// ============================================================
// External API types (TMDB, OMDB, MusicBrainz)
// ============================================================

export interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  adult?: boolean;
  video?: boolean;
  media_type?: string;
}

export interface TMDBMovieDetails extends TMDBSearchResult {
  imdb_id?: string;
  runtime?: number;
  budget?: number;
  revenue?: number;
  status?: string;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    cast?: TMDBCastMember[];
    crew?: TMDBCrewMember[];
  };
  videos?: {
    results?: TMDBVideo[];
  };
}

export interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TMDBVideo {
  key: string;
  site: string;
  type: string;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface OMDBRatings {
  imdbRating?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
  imdbID?: string;
  Response?: string;
  Error?: string;
}

export interface MusicBrainzRelease {
  id: string;
  title: string;
  date?: string;
  country?: string;
  barcode?: string;
  status?: string;
  packaging?: string;
  'label-info'?: Array<{
    'catalog-number'?: string;
    label?: { name?: string };
  }>;
  media?: Array<{
    format?: string;
    'track-count'?: number;
    tracks?: MusicBrainzTrack[];
  }>;
  'artist-credit'?: Array<{
    artist?: { name?: string; id?: string };
    name?: string;
    joinphrase?: string;
  }>;
  'release-group'?: {
    id?: string;
    title?: string;
    'primary-type'?: string;
    'secondary-types'?: string[];
    'first-release-date'?: string;
  };
  'text-representation'?: {
    language?: string;
  };
  relations?: MusicBrainzRelation[];
}

export interface MusicBrainzTrack {
  id: string;
  number: string;
  title: string;
  length?: number;
  recording?: {
    id: string;
    title: string;
    isrcs?: string[];
  };
}

export interface MusicBrainzRelation {
  type: string;
  'target-type': string;
  url?: { resource: string };
  attributes?: string[];
}

// ============================================================
// Service types
// ============================================================

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface ProgressInfo {
  id: string;
  status: string;
  progress: number;
  total: number;
  message?: string;
}

export interface ImageDownloadResult {
  localPath: string;
  relativePath: string;
}

export interface BackupInfo {
  filename: string;
  size: number;
  created: string;
}

// ============================================================
// Multer file type
// ============================================================

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer?: Buffer;
}

// ============================================================
// Generic utility types
// ============================================================

export interface DeleteResult {
  deleted: boolean | number;
  changes?: number;
}

export interface UpdateResult {
  id: number | string;
  changes: number;
}
