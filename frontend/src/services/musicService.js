const API_BASE_URL = process.env.REACT_APP_API_URL || '';

class MusicService {
  async getAllCds() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/music/cds`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching CDs:', error);
      throw error;
    }
  }

  async getCdById(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/music/cds/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching CD:', error);
      throw error;
    }
  }

  async searchCds(query) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/music/cds/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error searching CDs:', error);
      throw error;
    }
  }

  async addCd(cdData) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/music/cds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cdData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error adding CD:', error);
      throw error;
    }
  }

  async updateCd(id, cdData) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/music/cds/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cdData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating CD:', error);
      throw error;
    }
  }

  async deleteCd(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/music/cds/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error deleting CD:', error);
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

  async addCdFromMusicBrainz(releaseId, additionalData = {}) {
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
      console.error('Error adding CD from MusicBrainz:', error);
      throw error;
    }
  }

  async addCdByBarcode(barcode, additionalData = {}) {
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
      console.error('Error adding CD by barcode:', error);
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

export default new MusicService();

