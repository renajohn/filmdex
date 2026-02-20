class MusicService {
  private baseUrl: string | null;
  private configPromise: Promise<string> | null;

  constructor() {
    this.baseUrl = null;
    this.configPromise = null;
  }

  async getBaseUrl(): Promise<string> {
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

  async getAllAlbums(): Promise<unknown> {
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

  async getAlbumsByStatus(status: string): Promise<unknown> {
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

  async updateAlbumStatus(id: number | string, status: string): Promise<unknown> {
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

  async getAlbumById(id: number | string): Promise<unknown> {
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

  async searchAlbums(query: string): Promise<unknown> {
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

  async addAlbum(albumData: Record<string, unknown>): Promise<unknown> {
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

  async updateAlbum(id: number | string, albumData: Record<string, unknown>): Promise<unknown> {
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

  async deleteAlbum(id: number | string): Promise<unknown> {
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

  async getAppleMusicUrl(albumId: number | string): Promise<unknown> {
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
  openAppleMusic(url: string): void {
    try {
      const ua = navigator.userAgent || '';
      const platform = navigator.platform || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(platform) && 'ontouchend' in document);
      const isMac = /Mac/.test(platform) && !isIOS;
      const isHassApp = /HomeAssistant/i.test(ua) || (window.location.pathname || '').includes('/api/hassio_ingress/');

      const normalizeToUniversal = (u: string): string => {
        try {
          const parsed = new URL(u);
          if (parsed.hostname.includes('itunes.apple.com')) {
            parsed.hostname = 'music.apple.com';
            return parsed.toString();
          }
          return u;
        } catch {
          return u;
        }
      };

      // Best single URL for both macOS and iPhone is the universal link on music.apple.com
      // It should deep-link to the Music app without opening the App Store when the app is installed.
      const universalUrl = normalizeToUniversal(url);

      // macOS (regular browser): navigate in the same window to avoid blank tabs
      if (isMac && !isHassApp) {
        window.location.href = universalUrl;
        return;
      }

      // iOS and HA mobile: try deep-link schemes in sequence to wake app and select album
      if (isIOS && !isHassApp) {
        const hostless = universalUrl.replace(/^https?:\/\//i, '');
        const candidates = [
          `music://${hostless}`,
          universalUrl,
          `itms-apps://${hostless}`
        ];
        let idx = 0;
        const tryNext = (): void => {
          if (idx >= candidates.length) return;
          const target = candidates[idx++];
          try { window.location.assign(target); } catch (_) { /* ignore */ }
          setTimeout(tryNext, 600);
        };
        tryNext();
        return;
      }

      // HA ingress (macOS or iOS): avoid ingress rewriting by opening an external absolute link via a temporary anchor
      if (isHassApp) {
        try {
          // Try to foreground app quickly on iOS
          if (isIOS) {
            try { window.location.assign('music://'); } catch (_) { /* ignore */ }
          }
          const a = document.createElement('a');
          a.href = universalUrl;
          a.target = '_blank';
          a.rel = 'noreferrer noopener';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch (_) {
          window.open(universalUrl, '_blank', 'noopener');
        }
        return;
      }

      // Others: open universal link in new tab
      window.open(universalUrl, '_blank', 'noopener');

    } catch (_) {
      window.open(url, '_blank', 'noopener');
    }
  }

  async searchMusicBrainz(query: string): Promise<unknown> {
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

  async getCoverArt(releaseId: string): Promise<unknown> {
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

  async searchByCatalogNumber(catalogNumber: string): Promise<unknown> {
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

  async searchByBarcode(barcode: string): Promise<unknown> {
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

  async getMusicBrainzReleaseDetails(releaseId: string): Promise<unknown> {
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

  async addAlbumFromMusicBrainz(releaseId: string, additionalData: Record<string, unknown> = {}): Promise<unknown> {
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
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
        const errorMessage = (errorData.error as string) || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }
      return await response.json();
    } catch (error) {
      console.error('Error adding album from MusicBrainz:', error);
      throw error;
    }
  }

  async addAlbumByBarcode(barcode: string, additionalData: Record<string, unknown> = {}): Promise<unknown> {
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

  async getAutocompleteSuggestions(filterType: string, filterValue: string): Promise<unknown> {
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

  async uploadCover(albumId: number | string, file: File): Promise<unknown> {
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

  async uploadBackCover(albumId: number | string, file: File): Promise<unknown> {
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
   */
  getImageUrl(imagePath: string | null | undefined): string | null {
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
  async resizeAllAlbumCovers(): Promise<unknown> {
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
  async getAlbumsMissingCovers(type: string = 'back'): Promise<unknown> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/music/albums/missing-covers?type=${type}`);
    if (!response.ok) {
      throw new Error('Failed to get albums missing covers');
    }
    return await response.json();
  }

  // Fill covers for albums (front or back)
  async fillCovers(albumIds: number[], type: string = 'back'): Promise<unknown> {
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

  // Export albums as CSV
  async exportAlbumsCSV(columns: string[] | null = null): Promise<Blob> {
    const baseUrl = await this.getBaseUrl();
    const params = new URLSearchParams();
    if (columns && columns.length > 0) {
      params.append('columns', columns.join(','));
    }

    const queryString = params.toString();
    const endpoint = queryString ? `${baseUrl}/music/albums/export/csv?${queryString}` : `${baseUrl}/music/albums/export/csv`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error('Failed to export albums');
    }
    return await response.blob();
  }

  async toggleListenNext(albumId: number | string): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/music/albums/${albumId}/listen-next`, {
        method: 'PUT',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error toggling listen next:', error);
      throw error;
    }
  }

  async getListenNextAlbums(): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/collections/listen-next/albums`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching listen next albums:', error);
      throw error;
    }
  }

  /**
   * Smart fill Listen Next with suggested albums based on collection distribution
   * and listening history
   */
  async smartFillListenNext(): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/collections/listen-next/smart-fill`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error smart filling listen next:', error);
      throw error;
    }
  }

  /**
   * Get smart playlist statistics (artist distribution, suggestion history)
   */
  async getSmartPlaylistStats(): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/collections/listen-next/stats`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching smart playlist stats:', error);
      throw error;
    }
  }

  /**
   * Shuffle a specific album in Listen Next - replace it with a new suggestion
   * Classical albums are replaced with other classical albums
   * Non-classical albums are replaced with other non-classical albums
   */
  async shuffleListenNextAlbum(albumId: number | string): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/collections/listen-next/shuffle/${albumId}`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error shuffling listen next album:', error);
      throw error;
    }
  }
}

const musicServiceInstance = new MusicService();
export default musicServiceInstance;
