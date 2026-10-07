export interface AlbumStorySection {
  heading: string;
  level: number;
  text: string;
}

/** One language's article about the same subject. */
export interface AlbumStoryLink {
  lang: string;
  title: string;
  url: string;
}

export interface AlbumWorkStory {
  workTitle: string;
  tracks: number;
  lang: string;
  title: string;
  url: string;
  intro: string;
  sections: AlbumStorySection[];
  /** Every language the work has an article in, the one told above among them. */
  links?: AlbumStoryLink[];
}

export interface AlbumStory {
  albumId: number;
  found: boolean;
  reason: 'no_musicbrainz' | 'no_article' | null;
  lang: string | null;
  title: string | null;
  url: string | null;
  intro: string | null;
  sections: AlbumStorySection[];
  /** Only when the album has no article of its own. */
  works: AlbumWorkStory[];
  /** Every language the album has an article in, the one told above among them. */
  links?: AlbumStoryLink[];
  fetchedAt: string;
}

export type RipState = 'none' | 'lossy' | 'lossless';

export interface RipStatusAlbum {
  id: number;
  title: string;
  artist: string[];
  cover: string | null;
  musicbrainzReleaseId: string | null;
  state: RipState;
  formats: string[];
  matches: Array<{ name: string; artist: string; match: 'musicbrainz' | 'title'; state: RipState }>;
}

/** An edition DexVault took from a rip tagged by Picard, or why it left the album alone. */
export interface EditionAdoption {
  albumId: number | null;
  title: string;
  releaseId: string;
  action?: 'edition' | 'promoted' | 'added';
  previousReleaseId?: string | null;
  skipped?: 'no_release_group' | 'not_a_cd' | 'several_albums' | 'edition_taken' | 'failed';
}

/** One file of a CD's rip in Navidrome, matched to its track by disc and number. */
export interface RipTrackFile {
  id?: string | null;
  /** The track in Navidrome's web player. */
  url?: string | null;
  discNumber: number;
  track: number;
  title: string;
  durationSec: number | null;
  suffix: string;
  bitRate: number | null;
  bitDepth: number | null;
  samplingRate: number | null;
  channelCount: number | null;
  size: number | null;
  path: string | null;
}

export type RatingSync = 'synced' | 'not_ripped' | 'not_configured' | 'failed';

/** One entry of a CD's listening journal. */
export interface AlbumNote {
  id: number;
  albumId: number;
  note: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface RipTracks {
  configured: boolean;
  found: boolean;
  album?: { id: string; name: string; url?: string };
  tracks: RipTrackFile[];
}

export interface RipStatus {
  configured: boolean;
  error?: string;
  counts: Record<RipState, number>;
  albums: RipStatusAlbum[];
}

class MusicService {
  async getBaseUrl(): Promise<string> {
    return '/api';
  }

  /** Each CD and how it stands in Navidrome; refresh rereads the library instead of the minute-old copy. */
  async getRipStatus(refresh = false): Promise<RipStatus> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/music/rip-status${refresh ? '?refresh=1' : ''}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  /** Rereads Navidrome and takes the editions Picard identified the ripped CDs as. */
  async syncRipStatus(): Promise<{ editions: EditionAdoption[]; status: RipStatus }> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/music/rip-status/sync`, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
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

  /** The album's story from Wikipedia; cached by the backend, refreshed on demand. */
  async getAlbumStory(albumId: number | string, refresh = false): Promise<AlbumStory> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/music/albums/${albumId}/story${refresh ? '/refresh' : ''}`, {
      method: refresh ? 'POST' : 'GET',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  // Try to open native Apple Music app on macOS when possible, fallback to web
  openAppleMusic(url: string): void {
    try {
      const ua = navigator.userAgent || '';
      const platform = navigator.platform || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(platform) && 'ontouchend' in document);
      const isMac = /Mac/.test(platform) && !isIOS;

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

      // macOS: navigate in the same window to avoid blank tabs
      if (isMac) {
        window.location.href = universalUrl;
        return;
      }

      // iOS: try deep-link schemes in sequence to wake app and select album
      if (isIOS) {
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

      // Others: open universal link in new tab
      window.open(universalUrl, '_blank', 'noopener');

    } catch (_) {
      window.open(url, '_blank', 'noopener');
    }
  }

  /**
   * Identify an album from a photo of its sleeve.
   * `imageBase64` must be raw base64, without the data-url prefix.
   */
  async scanAlbumCover(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<unknown> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/music/scan-cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64, mimeType })
    });

    if (!response.ok) {
      let message = `HTTP error! status: ${response.status}`;
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch (_) { /* keep the status-based message */ }
      const error = new Error(message) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  /**
   * Read a sleeve from photographs and get a draft for the form.
   *
   * Either photograph may be omitted. Nothing is stored server-side: the answer
   * is a proposal, and the album exists only once the form is submitted.
   */
  async transcribeSleeve(
    photos: { front?: { base64: string; mimeType: string }; back?: { base64: string; mimeType: string } }
  ): Promise<unknown> {
    const baseUrl = await this.getBaseUrl();
    const body: Record<string, unknown> = {};
    if (photos.front) body.front = { image: photos.front.base64, mimeType: photos.front.mimeType };
    if (photos.back) body.back = { image: photos.back.base64, mimeType: photos.back.mimeType };

    const response = await fetch(`${baseUrl}/music/transcribe-sleeve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let message = `HTTP error! status: ${response.status}`;
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch (_) { /* keep the status */ }
      throw new Error(message);
    }

    return response.json();
  }

  /**
   * Add a release from whichever database it was found in.
   * Search results carry `source` and `releaseId`; pass them straight through.
   */
  async addAlbumFromSource(
    source: string,
    releaseId: string,
    additionalData: Record<string, unknown> = {}
  ): Promise<unknown> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(
      `${baseUrl}/music/releases/${encodeURIComponent(source)}/${encodeURIComponent(releaseId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(additionalData)
      }
    );

    if (!response.ok) {
      let message = `HTTP error! status: ${response.status}`;
      let code: string | undefined;
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
        code = body?.code;
      } catch (_) { /* keep the status-based message */ }
      const error = new Error(message) as Error & { status?: number; code?: string };
      error.status = response.status;
      error.code = code;
      throw error;
    }

    return await response.json();
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

  /** Store a cover image. Any straightening has already been applied to it. */
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

  /** Takes the cover Navidrome shows for this CD, the one in the rip, as the album's front cover. */
  async importNavidromeCover(albumId: number | string): Promise<{ coverPath: string }> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/music/albums/${albumId}/import-navidrome-cover`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP error! status: ${response.status}`);
    }
    return body;
  }

  /** The files of this CD's rip in Navidrome; found is false while it is not ripped. */
  private async send<T>(path: string, method: string, body?: unknown): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
    return result as T;
  }

  /** The owner's stars, 0 to take them away; Navidrome gets them too when the CD is ripped. */
  setAlbumRating(albumId: number | string, rating: number): Promise<{ userRating: number | null; navidrome: RatingSync }> {
    return this.send(`/music/albums/${albumId}/rating`, 'PUT', { rating });
  }

  /** Rereads the album's edition on MusicBrainz: its community rating, missing fields, a longer track list. */
  refreshFromMusicBrainz(albumId: number | string): Promise<unknown> {
    return this.send(`/music/albums/${albumId}/refresh-musicbrainz`, 'POST');
  }

  /** Takes the stars given in Navidrome or Amperfy since. */
  syncAlbumRating(albumId: number | string): Promise<{ userRating: number | null }> {
    return this.send(`/music/albums/${albumId}/rating/sync`, 'POST');
  }

  getAlbumNotes(albumId: number | string): Promise<AlbumNote[]> {
    return this.send(`/music/albums/${albumId}/notes`, 'GET');
  }

  addAlbumNote(albumId: number | string, note: string, date: string): Promise<AlbumNote> {
    return this.send(`/music/albums/${albumId}/notes`, 'POST', { note, date });
  }

  updateAlbumNote(id: number, note: string, date: string): Promise<AlbumNote> {
    return this.send(`/music/notes/${id}`, 'PUT', { note, date });
  }

  deleteAlbumNote(id: number): Promise<{ deleted: boolean }> {
    return this.send(`/music/notes/${id}`, 'DELETE');
  }

  async getNavidromeTracks(albumId: number | string): Promise<RipTracks> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/music/albums/${albumId}/navidrome-tracks`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP error! status: ${response.status}`);
    }
    return body;
  }

  /** As uploadCover, for the back. */
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
   * Get the full URL for an image path
   */
  getImageUrl(imagePath: string | null | undefined): string | null {
    if (!imagePath) return null;

    // Already a full URL
    if (imagePath.startsWith('http')) {
      return imagePath;
    }

    // Local paths are served as-is
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
