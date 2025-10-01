class ApiService {
  constructor() {
    this.baseUrl = null;
    this.configPromise = null;
  }

  // Utility method to get base URL for image URLs
  getImageBaseUrl() {
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

  async getBaseUrl() {
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

  async loadConfig() {
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

  async makeRequest(endpoint, options = {}) {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;
    
    // Default headers - only set Content-Type for JSON if not FormData
    const defaultHeaders = {};
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
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
      error.status = response.status;
      error.code = errorData.code;
      error.response = response;
      error.data = errorData;
      throw error;
    }

    return response;
  }

  async getAllMovies() {
    const response = await this.makeRequest('/movies');
    return await response.json();
  }

  async searchMovies(criteria) {
    const queryParams = new URLSearchParams();
    Object.keys(criteria).forEach(key => {
      if (criteria[key]) {
        queryParams.append(key, criteria[key]);
      }
    });
    
    const response = await this.makeRequest(`/movies/search?${queryParams}`);
    return await response.json();
  }

  async fetchRatings(title, year = null) {
    const params = new URLSearchParams({ title });
    if (year) params.append('year', year);
    
    const response = await this.makeRequest(`/ratings?${params}`);
    return await response.json();
  }

  async createMovie(movieData) {
    const response = await this.makeRequest('/movies', {
      method: 'POST',
      body: JSON.stringify(movieData),
    });
    return await response.json();
  }

  async updateMovie(id, movieData) {
    const response = await this.makeRequest(`/movies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(movieData),
    });
    return await response.json();
  }

  async getMovieById(id) {
    const response = await this.makeRequest(`/movies/${id}`);
    return await response.json();
  }

  async deleteMovie(id) {
    const response = await this.makeRequest(`/movies/${id}`, {
      method: 'DELETE',
    });
    return await response.json();
  }

  async exportCSV() {
    const response = await this.makeRequest('/movies/export/csv');
    return await response.blob();
  }

  async getMovieThumbnail(imdbLink, title = null, year = null) {
    const params = new URLSearchParams({ imdbLink });
    if (title) params.append('title', title);
    if (year) params.append('year', year);
    
    const response = await this.makeRequest(`/thumbnail?${params}`);
    return await response.json();
  }

  async getMovieBackdrop(tmdbId) {
    const response = await this.makeRequest(`/backdrop/${tmdbId}`);
    return await response.json();
  }

  async getMovieDetails(id) {
    const response = await this.makeRequest(`/movies/${id}/details`);
    return await response.json();
  }

  async getAutocompleteSuggestions(field, query) {
    const params = new URLSearchParams({ field });
    if (query) params.append('query', query);
    
    const response = await this.makeRequest(`/movies/autocomplete?${params}`);
    return await response.json();
  }

  async getFormats() {
    const response = await this.makeRequest('/movies/formats');
    return await response.json();
  }

  // Search movies using TMDB API
  async searchMoviesTMDB(query, year = null) {
    const params = new URLSearchParams({ query });
    if (year) params.append('year', year);
    
    const response = await this.makeRequest(`/movies/search/tmdb?${params}`);
    return await response.json();
  }

  // New combined search for movies and TV shows
  async searchAllTMDB(query, year = null) {
    const params = new URLSearchParams({ query });
    if (year) params.append('year', year);
    
    const response = await this.makeRequest(`/movies/search/all?${params}`);
    return await response.json();
  }

  // Get TMDB genres
  async getTMDBGenres() {
    const response = await this.makeRequest('/tmdb/genres');
    return await response.json();
  }

  // Get detailed movie information from TMDB
  async getMovieDetailsTMDB(tmdbId) {
    const response = await this.makeRequest(`/tmdb/movie/${tmdbId}`);
    return await response.json();
  }

  // Search OMDB for movie data
  async searchOMDB(title, year = null) {
    const params = new URLSearchParams({ t: title });
    if (year) {
      params.append('y', year);
    }
    
    const response = await this.makeRequest(`/omdb/search?${params}`);
    return await response.json();
  }

  // Check all editions of a movie by TMDB ID
  async checkMovieEditions(tmdbId) {
    const params = new URLSearchParams({ tmdb_id: tmdbId });
    const response = await this.makeRequest(`/movies/check-editions?${params}`);
    return await response.json();
  }

  // Upload CSV file and get headers for mapping
  async uploadCsv(file) {
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
  async processCsv(filePath, columnMapping) {
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
  async getImportStatus(importId) {
    const response = await this.makeRequest(`/import/${importId}`);
    return await response.json();
  }

  // Resolve an unmatched movie
  async resolveMovie(importId, unmatchedMovieTitle, resolvedMovie) {
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
  async getMovieSuggestions(importId, title, year = null) {
    const params = new URLSearchParams({ title });
    if (year) {
      params.append('year', year);
    }
    
    const response = await this.makeRequest(`/import/${importId}/suggestions?${params}`);
    return await response.json();
  }

  // Ignore an unmatched movie
  async ignoreMovie(importId, movieTitle) {
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
  async getMovieCast(movieId) {
    const response = await this.makeRequest(`/movies/${movieId}/cast`);
    return await response.json();
  }

  // Get crew for a movie
  async getMovieCrew(movieId) {
    const response = await this.makeRequest(`/movies/${movieId}/crew`);
    return await response.json();
  }

  // Add movie using the same pipeline as CSV import
  async addMovieWithPipeline(title, year = null, additionalData = {}) {
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
  async addMovie(movieData) {
    const response = await this.makeRequest('/movies/add', {
      method: 'POST',
      body: JSON.stringify(movieData),
    });
    
    return await response.json();
  }

  // Refresh movie ratings from external sources
  async refreshMovieRatings(movieId) {
    const response = await this.makeRequest(`/movies/${movieId}/refresh-ratings`, {
      method: 'POST',
    });
    
    return await response.json();
  }

  // Backfill API methods
  async getBackfillStatus() {
    const response = await this.makeRequest('/backfill/status', {
      method: 'GET',
    });
    
    return await response.json();
  }

  async startBackfill(options = {}) {
    const response = await this.makeRequest('/backfill/start', {
      method: 'POST',
      body: JSON.stringify(options),
    });
    
    return await response.json();
  }

  async getBackfillProgress() {
    const response = await this.makeRequest('/backfill/progress', {
      method: 'GET',
    });
    
    return await response.json();
  }

  async retryFailedMovies(movieIds) {
    const response = await this.makeRequest('/backfill/retry', {
      method: 'POST',
      body: JSON.stringify({ movieIds }),
    });
    
    return await response.json();
  }

  // Wish list methods
  async getMoviesByStatus(status) {
    const response = await this.makeRequest(`/movies/status/${status}`);
    return await response.json();
  }

  async updateMovieStatus(movieId, status) {
    const response = await this.makeRequest(`/movies/${movieId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ title_status: status }),
    });
    
    return await response.json();
  }

  async checkMovieStatus(tmdbId, title) {
    const params = new URLSearchParams();
    if (tmdbId) params.append('tmdb_id', tmdbId);
    if (title) params.append('title', title);
    
    const response = await this.makeRequest(`/movies/check-status?${params}`);
    return await response.json();
  }

  async migrateTitleStatus() {
    const response = await this.makeRequest('/migrate/title-status', {
      method: 'POST',
    });
    
    return await response.json();
  }

  // Watch Next methods
  async toggleWatchNext(movieId) {
    const response = await this.makeRequest(`/movies/${movieId}/watch-next`, {
      method: 'PUT',
    });
    
    return await response.json();
  }
}

const apiService = new ApiService();
export default apiService;