interface ApiError extends Error {
  status: number;
  code: string | undefined;
  response: Response;
  data: Record<string, unknown>;
}

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

class ApiService {
  private baseUrl: string | null;
  private configPromise: Promise<string> | null;

  constructor() {
    this.baseUrl = null;
    this.configPromise = null;
  }

  // Utility method to get base URL for image URLs
  getImageBaseUrl(): string {
    // Detect if we're running in Home Assistant ingress mode
    const pathname = window.location.pathname;

    if (pathname.includes('/api/hassio_ingress/')) {
      // Extract the ingress path from the current URL
      const match = pathname.match(/\/api\/hassio_ingress\/[^/]+/);
      if (match) {
        const ingressPath = match[0];
        return ingressPath; // Return ingress path for images
      }
    }

    // Default to empty string for normal mode (relative paths)
    return '';
  }

  async getBaseUrl(): Promise<string> {
    if (this.baseUrl) {
      return this.baseUrl;
    }

    if (this.configPromise) {
      return await this.configPromise;
    }

    this.configPromise = this.loadConfig();
    this.baseUrl = await this.configPromise;
    return this.baseUrl;
  }

  async loadConfig(): Promise<string> {
    // Detect if we're running in Home Assistant ingress mode
    const pathname = window.location.pathname;

    if (pathname.includes('/api/hassio_ingress/')) {
      // Extract the ingress path from the current URL
      const match = pathname.match(/\/api\/hassio_ingress\/[^/]+/);
      if (match) {
        const ingressPath = match[0];
        return `${ingressPath}/api`;
      }
    }

    // Default to /api for normal mode
    return '/api';
  }

  async makeRequest(endpoint: string, options: RequestOptions = {}): Promise<Response> {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    // Default headers - only set Content-Type for JSON if not FormData
    const defaultHeaders: Record<string, string> = {};
    if (!(options.body instanceof FormData)) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
      const error = new Error((errorData.error as string) || `HTTP error! status: ${response.status}`) as ApiError;
      error.status = response.status;
      error.code = errorData.code as string | undefined;
      error.response = response;
      error.data = errorData;
      throw error;
    }

    return response;
  }

  async getAllMovies(): Promise<unknown> {
    const response = await this.makeRequest('/movies');
    return await response.json();
  }

  async searchMovies(criteria: Record<string, string>): Promise<unknown> {
    const queryParams = new URLSearchParams();
    Object.keys(criteria).forEach(key => {
      if (criteria[key]) {
        queryParams.append(key, criteria[key]);
      }
    });

    const response = await this.makeRequest(`/movies/search?${queryParams}`);
    return await response.json();
  }

  async fetchRatings(title: string, year: string | null = null): Promise<unknown> {
    const params = new URLSearchParams({ title });
    if (year) params.append('year', year);

    const response = await this.makeRequest(`/ratings?${params}`);
    return await response.json();
  }

  async createMovie(movieData: Record<string, unknown>): Promise<unknown> {
    const response = await this.makeRequest('/movies', {
      method: 'POST',
      body: JSON.stringify(movieData),
    });
    return await response.json();
  }

  async updateMovie(id: number | string, movieData: Record<string, unknown>): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(movieData),
    });
    return await response.json();
  }

  async getMovieById(id: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${id}`);
    return await response.json();
  }

  async deleteMovie(id: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${id}`, {
      method: 'DELETE',
    });
    return await response.json();
  }

  async exportCSV(columns: string[] | null = null): Promise<Blob> {
    const params = new URLSearchParams();
    if (columns && columns.length > 0) {
      params.append('columns', columns.join(','));
    }

    const queryString = params.toString();
    const endpoint = queryString ? `/movies/export/csv?${queryString}` : '/movies/export/csv';

    const response = await this.makeRequest(endpoint);
    return await response.blob();
  }

  async getMovieThumbnail(imdbLink: string, title: string | null = null, year: string | null = null): Promise<unknown> {
    const params = new URLSearchParams({ imdbLink });
    if (title) params.append('title', title);
    if (year) params.append('year', year);

    const response = await this.makeRequest(`/thumbnail?${params}`);
    return await response.json();
  }

  async getMovieBackdrop(tmdbId: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/backdrop/${tmdbId}`);
    return await response.json();
  }

  async getMovieDetails(id: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${id}/details`);
    return await response.json();
  }

  async getAutocompleteSuggestions(field: string, query: string): Promise<unknown> {
    const params = new URLSearchParams({ field });
    if (query) params.append('query', query);

    const response = await this.makeRequest(`/movies/autocomplete?${params}`);
    return await response.json();
  }

  async getFormats(): Promise<unknown> {
    const response = await this.makeRequest('/movies/formats');
    return await response.json();
  }

  async getCollectionNames(): Promise<unknown> {
    const response = await this.makeRequest('/movies/collections');
    return await response.json();
  }


  // Get movies by collection name
  async getMoviesByCollection(collectionName: string): Promise<unknown> {
    const params = new URLSearchParams({ collectionName });
    const response = await this.makeRequest(`/movies/collections/movies?${params}`);
    return await response.json();
  }


  // Search movies using TMDB API
  async searchMoviesTMDB(query: string, year: string | null = null): Promise<unknown> {
    const params = new URLSearchParams({ query });
    if (year) params.append('year', year);

    const response = await this.makeRequest(`/movies/search/tmdb?${params}`);
    return await response.json();
  }

  // New combined search for movies and TV shows
  async searchAllTMDB(query: string, year: string | null = null): Promise<unknown> {
    const params = new URLSearchParams({ query });
    if (year) params.append('year', year);

    const response = await this.makeRequest(`/movies/search/all?${params}`);
    return await response.json();
  }

  // Get TMDB genres
  async getTMDBGenres(): Promise<unknown> {
    const response = await this.makeRequest('/tmdb/genres');
    return await response.json();
  }

  // Get detailed movie information from TMDB
  async getMovieDetailsTMDB(tmdbId: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/tmdb/movie/${tmdbId}`);
    return await response.json();
  }

  // Search OMDB for movie data
  async searchOMDB(title: string, year: string | null = null): Promise<unknown> {
    const params = new URLSearchParams({ t: title });
    if (year) {
      params.append('y', year);
    }

    const response = await this.makeRequest(`/omdb/search?${params}`);
    return await response.json();
  }

  // Check all editions of a movie by TMDB ID
  async checkMovieEditions(tmdbId: number | string): Promise<unknown> {
    const params = new URLSearchParams({ tmdb_id: String(tmdbId) });
    const response = await this.makeRequest(`/movies/check-editions?${params}`);
    return await response.json();
  }

  // Upload CSV file and get headers for mapping
  async uploadCsv(file: File): Promise<unknown> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.makeRequest('/import/csv', {
      method: 'POST',
      headers: {}, // Let browser set Content-Type for FormData
      body: formData,
    });

    return await response.json();
  }

  // Process CSV with column mapping
  async processCsv(filePath: string, columnMapping: Record<string, string>): Promise<unknown> {
    const response = await this.makeRequest('/import/process', {
      method: 'POST',
      body: JSON.stringify({
        filePath,
        columnMapping
      }),
    });

    return await response.json();
  }

  // Get import status
  async getImportStatus(importId: string): Promise<unknown> {
    const response = await this.makeRequest(`/import/${importId}`);
    return await response.json();
  }

  // Resolve an unmatched movie
  async resolveMovie(importId: string, unmatchedMovieTitle: string, resolvedMovie: Record<string, unknown>): Promise<unknown> {
    const response = await this.makeRequest('/import/resolve', {
      method: 'POST',
      body: JSON.stringify({
        importId,
        unmatchedMovieTitle,
        resolvedMovie
      }),
    });

    return await response.json();
  }

  // Get movie suggestions for unmatched movies
  async getMovieSuggestions(importId: string, title: string, year: string | null = null): Promise<unknown> {
    const params = new URLSearchParams({ title });
    if (year) {
      params.append('year', year);
    }

    const response = await this.makeRequest(`/import/${importId}/suggestions?${params}`);
    return await response.json();
  }

  // Ignore an unmatched movie
  async ignoreMovie(importId: string, movieTitle: string): Promise<unknown> {
    const response = await this.makeRequest('/import/ignore', {
      method: 'POST',
      body: JSON.stringify({
        importId,
        movieTitle
      }),
    });

    return await response.json();
  }

  // Get cast for a movie
  async getMovieCast(movieId: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/cast`);
    return await response.json();
  }

  // Get crew for a movie
  async getMovieCrew(movieId: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/crew`);
    return await response.json();
  }

  // Add movie using the same pipeline as CSV import
  async addMovieWithPipeline(title: string, year: string | null = null, additionalData: Record<string, unknown> = {}): Promise<unknown> {
    const response = await this.makeRequest('/movies/add-with-pipeline', {
      method: 'POST',
      body: JSON.stringify({
        title,
        year,
        format: additionalData.format || 'Blu-ray',
        price: additionalData.price || '',
        acquired_date: additionalData.acquired_date || new Date().toISOString().split('T')[0],
        comments: additionalData.comments || '',
        never_seen: additionalData.never_seen || false
      }),
    });

    return await response.json();
  }

  // Simple add movie endpoint
  async addMovie(movieData: Record<string, unknown>): Promise<unknown> {
    const response = await this.makeRequest('/movies/add', {
      method: 'POST',
      body: JSON.stringify(movieData),
    });

    return await response.json();
  }

  // Refresh movie ratings from external sources
  async refreshMovieRatings(movieId: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/refresh-ratings`, {
      method: 'POST',
    });

    return await response.json();
  }

  // Wish list methods
  async getMoviesByStatus(status: string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/status/${status}`);
    return await response.json();
  }

  async updateMovieStatus(movieId: number | string, status: string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ title_status: status }),
    });

    return await response.json();
  }

  async checkMovieStatus(tmdbId: string | null, title: string | null): Promise<unknown> {
    const params = new URLSearchParams();
    if (tmdbId) params.append('tmdb_id', tmdbId);
    if (title) params.append('title', title);

    const response = await this.makeRequest(`/movies/check-status?${params}`);
    return await response.json();
  }

  async migrateTitleStatus(): Promise<unknown> {
    const response = await this.makeRequest('/migrate/title-status', {
      method: 'POST',
    });

    return await response.json();
  }

  // Watch Next methods
  async toggleWatchNext(movieId: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/watch-next`, {
      method: 'PUT',
    });

    return await response.json();
  }

  // Mark movie as watched (sets last_watched to today)
  // incrementCount: true = always increment, false = only increment if count was 0
  async markMovieAsWatched(movieId: number | string, date: string | null = null, incrementCount: boolean = true): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/watched`, {
      method: 'PUT',
      body: JSON.stringify({ date, incrementCount }),
    });

    return await response.json();
  }

  // Clear movie watched date and count
  async clearMovieWatched(movieId: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/watched`, {
      method: 'DELETE',
    });

    return await response.json();
  }

  // Update movie watch count directly
  async updateMovieWatchCount(movieId: number | string, count: number): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/watch-count`, {
      method: 'PUT',
      body: JSON.stringify({ count }),
    });

    return await response.json();
  }

  async getWatchNextMovies(): Promise<unknown> {
    const response = await this.makeRequest('/collections/watch-next/movies');
    return await response.json();
  }

  // Get available posters from TMDB
  async getMoviePosters(tmdbId: number | string, mediaType: string = 'movie'): Promise<unknown> {
    const queryParam = mediaType ? `?mediaType=${mediaType}` : '';
    const response = await this.makeRequest(`/tmdb/${tmdbId}/posters${queryParam}`);
    return await response.json();
  }

  // Upload custom poster for a movie
  async uploadCustomPoster(movieId: number | string, file: File): Promise<unknown> {
    const formData = new FormData();
    formData.append('poster', file);

    const response = await this.makeRequest(`/movies/${movieId}/upload-poster`, {
      method: 'POST',
      body: formData,
    });

    return await response.json();
  }

  // ===== COLLECTION METHODS =====

  // Get all collections
  async getAllCollections(): Promise<unknown> {
    const response = await this.makeRequest('/collections');
    return await response.json();
  }

  // Get collection suggestions for typeahead
  async getCollectionSuggestions(query: string = ''): Promise<unknown> {
    const params = new URLSearchParams();
    if (query) params.append('q', query);

    const response = await this.makeRequest(`/collections/suggestions?${params}`);
    return await response.json();
  }

  // Create a new collection
  async createCollection(name: string): Promise<unknown> {
    const response = await this.makeRequest('/collections', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });

    return await response.json();
  }

  // Update collection name
  async updateCollection(id: number | string, name: string): Promise<unknown> {
    const response = await this.makeRequest(`/collections/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });

    return await response.json();
  }

  // Delete collection
  async deleteCollection(id: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/collections/${id}`, {
      method: 'DELETE',
    });

    return await response.json();
  }

  // Get movies in a collection
  async getCollectionMovies(collectionId: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/collections/${collectionId}/movies`);
    return await response.json();
  }

  // Get movie's collections
  async getMovieCollections(movieId: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/collections`);
    return await response.json();
  }

  // Add movie to collection
  async addMovieToCollection(movieId: number | string, collectionName: string, collectionType: string = 'user'): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ collectionName, collectionType }),
    });

    return await response.json();
  }

  // Remove movie from collection
  async removeMovieFromCollection(movieId: number | string, collectionId: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/collections/${collectionId}`, {
      method: 'DELETE',
    });

    return await response.json();
  }

  // Update collection name
  async updateCollectionName(collectionId: number | string, newName: string): Promise<unknown> {
    const response = await this.makeRequest(`/collections/${collectionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: newName }),
    });

    return await response.json();
  }

  // Clean up empty collections
  async cleanupEmptyCollections(): Promise<unknown> {
    const response = await this.makeRequest('/collections/cleanup', {
      method: 'POST',
    });

    return await response.json();
  }

  // Update movie's collections (replaces all collections)
  async updateMovieCollections(movieId: number | string, collectionNames: string[]): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/collections`, {
      method: 'PUT',
      body: JSON.stringify({ collectionNames }),
    });

    return await response.json();
  }

  // Handle collection name change (rename vs create new)
  async handleCollectionNameChange(oldName: string, newName: string, action: string): Promise<unknown> {
    const response = await this.makeRequest('/collections/handle-name-change', {
      method: 'POST',
      body: JSON.stringify({ oldName, newName, action }),
    });

    return await response.json();
  }

  // Update movie order in collection
  async updateMovieOrder(movieId: number | string, collectionId: number | string, order: number): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${movieId}/collections/${collectionId}/order`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    });

    return await response.json();
  }

  // Get autocomplete suggestions for search filters
  async getAutocompleteSuggestionsForSearch(field: string, query: string): Promise<unknown> {
    const queryParams = new URLSearchParams();
    queryParams.append('field', field);
    queryParams.append('query', query);

    const response = await this.makeRequest(`/movies/autocomplete?${queryParams}`);
    return await response.json();
  }

  // Scan a movie cover image using local LLM
  async scanMovieCover(base64Image: string, mimeType: string): Promise<unknown> {
    const response = await this.makeRequest('/movies/scan-cover', {
      method: 'POST',
      body: JSON.stringify({ image: base64Image, mimeType }),
    });
    return await response.json();
  }

  // Scan a book cover image using local LLM
  async scanBookCover(base64Image: string, mimeType: string): Promise<unknown> {
    const response = await this.makeRequest('/books/scan-cover', {
      method: 'POST',
      body: JSON.stringify({ image: base64Image, mimeType }),
    });
    return await response.json();
  }

  // Check if cover scan (LLM) service is available
  async checkCoverScanHealth(): Promise<unknown> {
    const response = await this.makeRequest('/cover-scan/health');
    return await response.json();
  }

  // Get analytics data
  async getAnalytics(): Promise<unknown> {
    const response = await this.makeRequest('/analytics');
    return await response.json();
  }

  // Get music analytics data
  async getMusicAnalytics(): Promise<unknown> {
    const response = await this.makeRequest('/analytics/music');
    return await response.json();
  }

  // Get book analytics data
  async getBookAnalytics(): Promise<unknown> {
    const response = await this.makeRequest('/analytics/books');
    return await response.json();
  }
}

const apiService = new ApiService();
export default apiService;
