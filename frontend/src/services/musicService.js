class MusicService {
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

  async getAllAlbums() {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/albums`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching albums:', error);
      throw error;
    }
  }

  async getAlbumsByStatus(status) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/albums/status/${status}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching albums by status:', error);
      throw error;
    }
  }

  async updateAlbumStatus(id, status) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/albums/${id}/status`, {
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
      console.error('Error updating album status:', error);
      throw error;
    }
  }

  async getAlbumById(id) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/albums/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching album:', error);
      throw error;
    }
  }

  async searchAlbums(query) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/albums/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error searching albums:', error);
      throw error;
    }
  }

  async addAlbum(albumData) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/albums`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(albumData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error adding album:', error);
      throw error;
    }
  }

  async updateAlbum(id, albumData) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/albums/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(albumData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating album:', error);
      throw error;
    }
  }

  async deleteAlbum(id) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/albums/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error deleting album:', error);
      throw error;
    }
  }

  async getAppleMusicUrl(albumId) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/albums/${albumId}/apple-music`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json(); // { url, cached }
    } catch (error) {
      console.error('Error getting Apple Music URL:', error);
      throw error;
    }
  }

  // Try to open native Apple Music app on macOS when possible, fallback to web
  openAppleMusic(url) {
    try {
      const ua = navigator.userAgent || '';
      const platform = navigator.platform || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(platform) && 'ontouchend' in document);
      const isMac = /Mac/.test(platform) && !isIOS;
      const isHassApp = /HomeAssistant/i.test(ua) || (window.location.pathname || '').includes('/api/hassio_ingress/');

      // In mobile app/webviews (like Home Assistant app), opening a new window is often blocked.
      // Use same-window navigation to allow iOS Universal Links to hand off to the Music app.
      if (isHassApp || isIOS) {
        window.location.assign(url);
        return;
      }

      // Desktop/mac browsers: new tab is fine; macOS usually hands off to Music if configured
      window.open(url, '_blank', 'noopener');
    } catch (_) {
      window.open(url, '_blank', 'noopener');
    }
  }

  async searchMusicBrainz(query) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error searching MusicBrainz:', error);
      throw error;
    }
  }

  async getCoverArt(releaseId) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/coverart/${encodeURIComponent(releaseId)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error getting cover art:', error);
      return null;
    }
  }

  async searchByCatalogNumber(catalogNumber) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/search/catalog?catalogNumber=${encodeURIComponent(catalogNumber)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error searching by catalog number:', error);
      throw error;
    }
  }

  async searchByBarcode(barcode) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/search/barcode?barcode=${encodeURIComponent(barcode)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error searching by barcode:', error);
      throw error;
    }
  }

  async getMusicBrainzReleaseDetails(releaseId) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/release/${releaseId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error getting MusicBrainz release details:', error);
      throw error;
    }
  }

  async addAlbumFromMusicBrainz(releaseId, additionalData = {}) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/release/${releaseId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(additionalData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }
      return await response.json();
    } catch (error) {
      console.error('Error adding album from MusicBrainz:', error);
      throw error;
    }
  }

  async addAlbumByBarcode(barcode, additionalData = {}) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/barcode/${barcode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(additionalData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error adding album by barcode:', error);
      throw error;
    }
  }

  async getAutocompleteSuggestions(filterType, filterValue) {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(
        `${baseUrl}/music/autocomplete?field=${encodeURIComponent(filterType)}&value=${encodeURIComponent(filterValue)}`
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

  async uploadCover(albumId, file) {
    try {
      const baseUrl = await this.getBaseUrl();
      const formData = new FormData();
      formData.append('cover', file);

      const response = await fetch(`${baseUrl}/music/albums/${albumId}/upload-cover`, {
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

  async uploadBackCover(albumId, file) {
    try {
      const baseUrl = await this.getBaseUrl();
      const formData = new FormData();
      // Backend middleware expects the field name 'cover' for both endpoints
      formData.append('cover', file);

      const response = await fetch(`${baseUrl}/music/albums/${albumId}/upload-back-cover`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error uploading back cover:', error);
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

  // Migration: Resize all album covers to 1000x1000
  async resizeAllAlbumCovers() {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/music/migrate/resize-covers`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to resize album covers');
    }
    return await response.json();
  }

  // Get albums missing covers (front or back)
  async getAlbumsMissingCovers(type = 'back') {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/music/albums/missing-covers?type=${type}`);
    if (!response.ok) {
      throw new Error('Failed to get albums missing covers');
    }
    return await response.json();
  }

  // Fill covers for albums (front or back)
  async fillCovers(albumIds, type = 'back') {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/music/albums/fill-covers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ albumIds, type }),
    });
    if (!response.ok) {
      throw new Error('Failed to fill covers');
    }
    return await response.json();
  }
}

const musicServiceInstance = new MusicService();
export default musicServiceInstance;

