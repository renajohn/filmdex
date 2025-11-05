class BookService {
  constructor() {
    this.baseUrl = null;
    this.configPromise = null;
  }

  async getBaseUrl() {
    // If we already have the base URL, return it
    if (this.baseUrl) {
      return this.baseUrl;
    }

    // If we're already loading the config, wait for it
    if (!this.configPromise) {
      this.configPromise = this.loadConfig();
    }

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

  async getAllBooks() {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching books:', error);
      throw error;
    }
  }

  async getBooksByStatus(status) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/status/${status}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching books by status:', error);
      throw error;
    }
  }

  async updateBookStatus(id, status) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating book status:', error);
      throw error;
    }
  }

  async getBookById(id) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching book:', error);
      throw error;
    }
  }

  async searchBooks(query) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error searching books:', error);
      throw error;
    }
  }

  async searchExternalBooks(query, filters = {}) {
    try {
      const baseUrl = await this.getBaseUrl();
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (filters.isbn) params.append('isbn', filters.isbn);
      if (filters.author) params.append('author', filters.author);
      if (filters.title) params.append('title', filters.title);
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.language) params.append('language', filters.language);
      
      const response = await fetch(`${baseUrl}/books/search/external?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error searching external books:', error);
      throw error;
    }
  }

  async searchSeriesVolumes(seriesName, options = {}) {
    try {
      const baseUrl = await this.getBaseUrl();
      const params = new URLSearchParams();
      params.append('series', seriesName);
      if (options.language) params.append('language', options.language);
      if (options.maxVolumes) params.append('maxVolumes', options.maxVolumes);
      
      const response = await fetch(`${baseUrl}/books/search/series?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error searching series volumes:', error);
      throw error;
    }
  }

  async getBooksBySeries(seriesName) {
    try {
      const baseUrl = await this.getBaseUrl();
      const params = new URLSearchParams();
      params.append('series', seriesName);
      
      const response = await fetch(`${baseUrl}/books/series?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error getting books by series:', error);
      throw error;
    }
  }

  async enrichBook(bookData) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bookData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error enriching book:', error);
      // Return original book if enrichment fails
      return bookData;
    }
  }

  async addBook(bookData) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bookData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }
      return await response.json();
    } catch (error) {
      console.error('Error adding book:', error);
      throw error;
    }
  }

  async addBooksBatch(booksData) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ books: booksData }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error adding books batch:', error);
      throw error;
    }
  }

  async updateBook(id, bookData) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bookData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating book:', error);
      throw error;
    }
  }

  async deleteBook(id) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error deleting book:', error);
      throw error;
    }
  }

  async getAutocompleteSuggestions(filterType, filterValue) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(
        `${baseUrl}/books/autocomplete?field=${encodeURIComponent(filterType)}&value=${encodeURIComponent(filterValue)}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
      throw error;
    }
  }

  async uploadEbook(bookId, file) {
    try {
      const baseUrl = await this.getBaseUrl();
      const formData = new FormData();
      formData.append('ebook', file);

      const response = await fetch(`${baseUrl}/books/${bookId}/upload-ebook`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to upload ebook' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error uploading ebook:', error);
      throw error;
    }
  }

  async getEbookInfo(bookId) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/${bookId}/ebook/info`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error getting ebook info:', error);
      throw error;
    }
  }

  async downloadEbook(bookId) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/${bookId}/ebook/download`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `book_${bookId}.epub`;
      if (contentDisposition) {
        // Try to match quoted filename first: filename="something"
        let filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
        if (!filenameMatch) {
          // Fallback to unquoted: filename=something
          filenameMatch = contentDisposition.match(/filename=([^;]+)/i);
        }
        if (filenameMatch) {
          filename = filenameMatch[1].trim();
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading ebook:', error);
      throw error;
    }
  }

  async deleteEbook(bookId) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/${bookId}/ebook`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete ebook' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting ebook:', error);
      throw error;
    }
  }

  async uploadCover(bookId, file) {
    try {
      const baseUrl = await this.getBaseUrl();
      const formData = new FormData();
      formData.append('cover', file);

      const response = await fetch(`${baseUrl}/books/${bookId}/upload-cover`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error uploading cover:', error);
      throw error;
    }
  }

  /**
   * Get the full URL for an image path, handling Home Assistant ingress mode
   * @param {string} imagePath - Path starting with /api/images/ or /images/
   * @returns {string} - Full URL with ingress prefix if needed
   */
  getImageUrl(imagePath) {
    if (!imagePath) return null;
    
    // Already a full URL
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    
    // Detect if we're in Home Assistant ingress mode
    const pathname = window.location.pathname;
    if (pathname.includes('/api/hassio_ingress/')) {
      const match = pathname.match(/\/api\/hassio_ingress\/[^/]+/);
      if (match) {
        const ingressPath = match[0];
        // If path starts with /api/images/, prepend ingress path
        if (imagePath.startsWith('/api/images/')) {
          return `${ingressPath}${imagePath}`;
        }
        // If path starts with /images/, convert to /api/images/ and prepend ingress
        if (imagePath.startsWith('/images/')) {
          return `${ingressPath}/api${imagePath}`;
        }
        // Otherwise, assume it needs /api/images/ prefix
        return `${ingressPath}/api/images/${imagePath}`;
      }
    }
    
    // Normal mode - just return the path as-is if it starts with /api/images/
    if (imagePath.startsWith('/api/images/') || imagePath.startsWith('/images/')) {
      return imagePath;
    }
    
    // Default: prepend /api/images/
    return `/api/images/${imagePath}`;
  }

  // Export books as CSV
  async exportBooksCSV() {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/books/export/csv`);
    if (!response.ok) {
      throw new Error('Failed to export books');
    }
    return await response.blob();
  }
}

const bookServiceInstance = new BookService();
export default bookServiceInstance;

