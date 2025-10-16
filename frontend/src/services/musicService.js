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
        throw new Error(`HTTP error! status: ${response.status}`);
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
}

const musicServiceInstance = new MusicService();
export default musicServiceInstance;

