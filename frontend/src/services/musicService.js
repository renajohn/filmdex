const API_BASE_URL = process.env.REACT_APP_API_URL || '';

class MusicService {
  async getAllAlbums() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/music/albums`);
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
      const response = await fetch(`${API_BASE_URL}/api/music/albums/${id}`);
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
      const response = await fetch(`${API_BASE_URL}/api/music/albums/search?q=${encodeURIComponent(query)}`);
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
      const response = await fetch(`${API_BASE_URL}/api/music/albums`, {
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
      const response = await fetch(`${API_BASE_URL}/api/music/albums/${id}`, {
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
      const response = await fetch(`${API_BASE_URL}/api/music/albums/${id}`, {
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
      const response = await fetch(`${API_BASE_URL}/api/music/search?q=${encodeURIComponent(query)}`);
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
      const response = await fetch(`${API_BASE_URL}/api/music/search/catalog?catalogNumber=${encodeURIComponent(catalogNumber)}`);
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
      const response = await fetch(`${API_BASE_URL}/api/music/search/barcode?barcode=${encodeURIComponent(barcode)}`);
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
      const response = await fetch(`${API_BASE_URL}/api/music/release/${releaseId}`);
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
      const response = await fetch(`${API_BASE_URL}/api/music/release/${releaseId}`, {
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
      const response = await fetch(`${API_BASE_URL}/api/music/barcode/${barcode}`, {
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
      const response = await fetch(
        `${API_BASE_URL}/api/music/autocomplete?field=${encodeURIComponent(filterType)}&value=${encodeURIComponent(filterValue)}`
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

