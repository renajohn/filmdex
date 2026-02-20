
import Album from '../models/album';
import Track from '../models/track';
import musicbrainzService from './musicbrainzService';
import type { FormattedRelease } from './musicbrainzService';
import imageService from './imageService';
import axios, { AxiosResponse } from 'axios';
import logger from '../logger';
import path from 'path';
import type { AlbumFormatted, AlbumCreateData, TrackFormatted } from '../types';

interface AlbumData {
  title?: string;
  artist?: string[];
  releaseYear?: number | null;
  cover?: string | null;
  backCover?: string | null;
  labels?: string[];
  genres?: string[];
  barcode?: string | null;
  catalogNumber?: string | null;
  country?: string | null;
  discs?: DiscData[];
  ownership?: {
    condition?: string | null;
    purchasedAt?: string | null;
    priceChf?: number | null;
    notes?: string | null;
  };
  coverArtData?: {
    frontCoverUrl?: string;
    backCoverUrl?: string;
  };
  urls?: Record<string, string>;
  isrcCodes?: string[];
  [key: string]: unknown;
}

interface DiscData {
  number: number;
  tracks: TrackData[];
}

interface TrackData {
  trackNumber?: number;
  no?: number;
  title: string;
  durationSec?: number | null;
  isrc?: string | null;
  musicbrainzRecordingId?: string | null;
  musicbrainzTrackId?: string | null;
  toc?: string | null;
}

interface DataQualityResult {
  score: number;
  maxScore: number;
  details: Record<string, boolean>;
}

interface AppleMusicResult {
  url: string;
  cached: boolean;
}

interface AutocompleteRow {
  [key: string]: string | number | null;
}

interface ITunesResponse {
  results?: Array<{
    collectionId?: number;
    collectionViewUrl?: string;
    trackViewUrl?: string;
    artistName?: string;
    collectionName?: string;
    collectionType?: string;
    trackCount?: number;
    releaseDate?: string;
  }>;
}

class MusicService {
  async initializeTables(): Promise<void> {
    try {
      await Album.createTable();
      await Track.createTable();
      console.log('Music tables initialized successfully');
    } catch (error) {
      console.error('Error initializing music tables:', error);
      throw error;
    }
  }

  async searchAlbums(query: string): Promise<AlbumFormatted[]> {
    try {
      return await Album.search(query);
    } catch (error) {
      console.error('Error searching albums:', error);
      throw error;
    }
  }

  async getAllAlbums(): Promise<AlbumFormatted[]> {
    try {
      return await Album.findAll();
    } catch (error) {
      console.error('Error getting all albums:', error);
      throw error;
    }
  }

  async getAlbumsByStatus(status: string): Promise<AlbumFormatted[]> {
    try {
      return await Album.findByStatus(status);
    } catch (error) {
      console.error('Error getting albums by status:', error);
      throw error;
    }
  }

  async updateAlbumStatus(id: number, status: string): Promise<{ id: number; title_status: string }> {
    try {
      return await Album.updateStatus(id, status);
    } catch (error) {
      console.error('Error updating album status:', error);
      throw error;
    }
  }

  async getAlbumById(id: number): Promise<AlbumFormatted & { discs: Array<{ number: number; tracks: Array<{ no: number; title: string; durationSec: number | null }> }> }> {
    try {
      const album = await Album.findById(id);
      if (!album) {
        throw new Error('Album not found');
      }

      // Get tracks for this CD
      console.log(`Fetching tracks for album ID: ${id}`);
      const tracks = await Track.findByCdId(id);
      console.log(`Found ${tracks.length} tracks`);

      // Group tracks by disc
      const discs: Record<number, TrackFormatted[]> = {};
      tracks.forEach(track => {
        if (!discs[track.discNumber]) {
          discs[track.discNumber] = [];
        }
        discs[track.discNumber].push(track);
      });

      // Convert to array format
      const discsArray = Object.keys(discs).map(discNumber => ({
        number: parseInt(discNumber),
        tracks: discs[parseInt(discNumber)].map(track => ({
          no: track.trackNumber,
          title: track.title,
          durationSec: track.durationSec
        }))
      }));

      return {
        ...album,
        discs: discsArray
      };
    } catch (error) {
      console.error('Error getting album:', error);
      throw error;
    }
  }

  async addAlbum(albumData: AlbumData): Promise<AlbumFormatted> {
    try {
      // Create the album
      let album = await Album.create(albumData as unknown as AlbumCreateData) as unknown as AlbumFormatted;

      // Ensure covers are persisted even if model mapping missed them
      const needsFrontPersist = albumData.cover && (!album.cover || album.cover.trim() === '');
      const needsBackPersist = albumData.backCover && (!album.backCover || album.backCover.trim() === '');
      if (needsFrontPersist) {
        try {
          await Album.updateFrontCover(album.id, albumData.cover!);
        } catch (e: unknown) {
          const err = e as { message: string };
          console.warn(`Failed to persist front cover for album ${album.id}:`, err.message);
        }
      }
      if (needsBackPersist) {
        try {
          await Album.updateBackCover(album.id, albumData.backCover!);
        } catch (e: unknown) {
          const err = e as { message: string };
          console.warn(`Failed to persist back cover for album ${album.id}:`, err.message);
        }
      }
      if (needsFrontPersist || needsBackPersist) {
        album = (await Album.findById(album.id))!;
      }

      // Add tracks if provided
      if (albumData.discs && albumData.discs.length > 0) {
        console.log(`Adding ${albumData.discs.length} disc(s) with tracks for album ID: ${album.id}`);
        for (const disc of albumData.discs) {
          console.log(`  Disc ${disc.number}: ${disc.tracks?.length || 0} tracks`);
          for (const track of disc.tracks) {
            try {
              await Track.create({
                albumId: album.id,
                discNumber: disc.number,
                trackNumber: track.trackNumber ?? track.no ?? 0,
                title: track.title,
                durationSec: track.durationSec,
                isrc: track.isrc,
                musicbrainzRecordingId: track.musicbrainzRecordingId,
                musicbrainzTrackId: track.musicbrainzTrackId,
                toc: track.toc
              });
            } catch (trackError) {
              console.error(`Failed to create track ${track.trackNumber || track.no}:`, trackError);
              throw trackError;
            }
          }
        }
        console.log(`Successfully added tracks for album ID: ${album.id}`);
      } else {
        console.log('No tracks to add for this album');
      }

      return album;
    } catch (error) {
      console.error('Error adding album:', error);
      throw error;
    }
  }

  async updateAlbum(id: number, albumData: AlbumData): Promise<AlbumFormatted> {
    try {
      // Update the album
      const album = await Album.update(id, albumData as unknown as AlbumCreateData) as unknown as AlbumFormatted;

      // Update tracks if provided
      if (albumData.discs && albumData.discs.length > 0) {
        console.log(`Deleting existing tracks for album ID: ${id}`);
        await Track.deleteByCdId(id);

        console.log(`Adding ${albumData.discs.length} disc(s) with tracks for album ID: ${id}`);
        for (const disc of albumData.discs) {
          console.log(`  Disc ${disc.number}: ${disc.tracks?.length || 0} tracks`);
          for (const track of disc.tracks) {
            try {
              await Track.create({
                albumId: id,
                discNumber: disc.number,
                trackNumber: track.trackNumber ?? track.no ?? 0,
                title: track.title,
                durationSec: track.durationSec,
                isrc: track.isrc,
                musicbrainzRecordingId: track.musicbrainzRecordingId,
                musicbrainzTrackId: track.musicbrainzTrackId,
                toc: track.toc
              });
            } catch (trackError) {
              console.error(`Failed to create track ${track.trackNumber || track.no}:`, trackError);
              throw trackError;
            }
          }
        }
        console.log(`Successfully updated tracks for album ID: ${id}`);
      }

      return album;
    } catch (error) {
      console.error('Error updating album:', error);
      throw error;
    }
  }

  async deleteAlbum(id: number): Promise<{ deleted: boolean }> {
    try {
      const result = await Album.delete(id);
      return result;
    } catch (error) {
      console.error('Error deleting album:', error);
      throw error;
    }
  }

  // Resolve and cache Apple Music album URL
  async getAppleMusicUrl(albumId: number): Promise<AppleMusicResult> {
    try {
      const album = await Album.findById(albumId);
      if (!album) {
        throw new Error('Album not found');
      }

      // If cached URL exists, return it
      if (album.urls && album.urls.appleMusic) {
        logger.info(`[AppleMusic] Using cached URL for album ${albumId}: ${album.urls.appleMusic}`);
        return { url: album.urls.appleMusic, cached: true };
      }

      // If any existing URL looks like Apple Music/iTunes, use and cache it
      if (album.urls && typeof album.urls === 'object') {
        const values = Object.values(album.urls);
        const existingApple = values.find(u => typeof u === 'string' && /\b(music\.apple\.com|itunes\.apple\.com)\b/.test(u));
        if (existingApple) {
          logger.info(`[AppleMusic] Found existing Apple URL in urls for album ${albumId}: ${existingApple}`);
          try {
            await Album.updateUrls(albumId, { appleMusic: existingApple });
          } catch (_) { /* non-fatal */ }
          return { url: existingApple, cached: true };
        }
      }

      // Build normalized helpers
      const artistText = Array.isArray(album.artist) ? album.artist.join(' ') : (album.artist || '');
      const titleText = album.title || '';
      const norm = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const wantArtist = norm(artistText);
      const wantTitle = norm(titleText);

      const countries = ['CH', 'US', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'PT'];

      let expectedTrackCount: number | null = null;
      try {
        const tracksForCount = await Track.findByCdId(albumId);
        expectedTrackCount = Array.isArray(tracksForCount) ? tracksForCount.length : null;
      } catch (_) { /* ignore */ }

      logger.info(`[AppleMusic] Resolving URL for album ${albumId}: title="${titleText}", artist="${artistText}", barcode=${album.barcode || '-'} isrcs_in_album=${Array.isArray(album.isrcCodes) ? album.isrcCodes.length : 0}`);

      // 1) Try UPC/EAN (barcode) exact lookup
      if (album.barcode) {
        for (const country of countries) {
          try {
            const resp: AxiosResponse<ITunesResponse> = await axios.get('https://itunes.apple.com/lookup', {
              params: { upc: album.barcode, entity: 'album', country },
              timeout: 8000
            });
            const items = resp.data?.results || [];
            logger.debug(`[AppleMusic] UPC lookup country=${country} results=${items.length}`);
            const found = items.find(it => it.collectionViewUrl);
            if (found && found.collectionViewUrl) {
              const url = found.collectionViewUrl;
              logger.info(`[AppleMusic] UPC match for album ${albumId} in ${country}: ${url}`);
              try { await Album.updateUrls(albumId, { appleMusic: url }); } catch (_) { /* non-fatal */ }
              return { url, cached: true };
            }
          } catch (_) {
            // try next country
          }
        }
      }

      // 2) Try ISRC-based lookup
      let isrcList: string[] = Array.isArray(album.isrcCodes) ? album.isrcCodes.filter(Boolean) : [];
      if (!isrcList || isrcList.length === 0) {
        try {
          const tracks = await Track.findByCdId(albumId);
          isrcList = Array.from(new Set(tracks.map(t => t.isrc).filter(Boolean))) as string[];
        } catch (_) { /* ignore */ }
      }
      if (isrcList && isrcList.length > 0) {
        const collectionVotes = new Map<number, { count: number; url: string | undefined }>();
        for (const isrc of isrcList.slice(0, 8)) {
          for (const country of countries) {
            try {
              const resp: AxiosResponse<ITunesResponse> = await axios.get('https://itunes.apple.com/lookup', {
                params: { isrc, country },
                timeout: 8000
              });
              const items = resp.data?.results || [];
              logger.debug(`[AppleMusic] ISRC lookup isrc=${isrc} country=${country} results=${items.length}`);
              items.forEach(it => {
                if (it.collectionId && (it.collectionViewUrl || it.trackViewUrl)) {
                  const prev = collectionVotes.get(it.collectionId) || { count: 0, url: it.collectionViewUrl };
                  collectionVotes.set(it.collectionId, { count: prev.count + 1, url: prev.url || it.collectionViewUrl });
                }
              });
            } catch (_) {
              // try next
            }
          }
        }
        if (collectionVotes.size > 0) {
          const majority = Array.from(collectionVotes.entries()).sort((a, b) => b[1].count - a[1].count)[0];
          const collectionId = majority[0];
          logger.info(`[AppleMusic] ISRC majority collectionId=${collectionId} votes=${majority[1].count}`);
          for (const country of countries) {
            try {
              const resp: AxiosResponse<ITunesResponse> = await axios.get('https://itunes.apple.com/lookup', {
                params: { id: collectionId, entity: 'album', country },
                timeout: 8000
              });
              const item = (resp.data?.results || []).find(r => r.collectionViewUrl);
              if (item && item.collectionViewUrl) {
                const url = item.collectionViewUrl;
                logger.info(`[AppleMusic] Resolved album by collectionId in ${country}: ${url}`);
                try { await Album.updateUrls(albumId, { appleMusic: url }); } catch (_) { /* non-fatal */ }
                return { url, cached: true };
              }
            } catch (_) { /* ignore */ }
          }
        }
      }

      // Two-pass strategy: precise album title first, then broader search
      async function searchItunes(params: Record<string, string | number>): Promise<ITunesResponse['results']> {
        try {
          const resp: AxiosResponse<ITunesResponse> = await axios.get(`https://itunes.apple.com/search`, { params, timeout: 8000 });
          return resp.data?.results || [];
        } catch (_) {
          return [];
        }
      }

      const scoreItem = (it: NonNullable<ITunesResponse['results']>[number]): number => {
        const a = norm(it.artistName || '');
        const t = norm(it.collectionName || '');
        let score = 0;
        if (it.collectionType === 'Album' || it.collectionType === 'Compilation') score += 2;
        if (t === wantTitle) score += 3;
        if (a === wantArtist) score += 3;
        if (wantArtist && a.includes(wantArtist)) score += 2;
        if (wantTitle) {
          const words = wantTitle.split(' ').filter(Boolean);
          if (t.includes(wantTitle) || words.every(w => t.includes(w))) score += 2;
        }
        const isLikelySingle = /\b(single|ep)\b/i.test(it.collectionName || '');
        const titleSaysSingle = /\b(single|ep)\b/i.test(titleText || '');
        if (isLikelySingle && !titleSaysSingle) score -= 3;
        if (typeof it.trackCount === 'number') {
          if (it.trackCount >= 6) score += 1;
          if (it.trackCount <= 2 && !titleSaysSingle) score -= 1;
          if (expectedTrackCount && Math.abs(it.trackCount - expectedTrackCount) <= 2) score += 2;
        }
        if (album!.releaseYear && it.releaseDate) {
          const y = new Date(it.releaseDate).getFullYear();
          if (Math.abs(y - (album!.releaseYear as number)) <= 1) score += 1;
        }
        const wantBest = /\b(best|greatest)\b/.test(wantTitle);
        const hasBest = /\b(best|greatest)\b/.test(t);
        if (wantBest && hasBest) score += 2;
        if (wantBest && !hasBest) score -= 1;
        return score;
      };

      let result: string | null = null;
      for (const country of countries) {
        const pass1 = await searchItunes({
          term: titleText,
          media: 'music',
          entity: 'album',
          attribute: 'albumTerm',
          limit: 10,
          country
        });
        let candidates = (pass1 || []).filter(Boolean);
        logger.debug(`[AppleMusic] Country ${country} pass1 candidates=${candidates.length}`);
        if (wantArtist) {
          candidates = candidates.filter(it => norm(it.artistName || '').includes(wantArtist));
        }
        if (candidates.length === 0) {
          const pass2 = await searchItunes({
            term: `${artistText} ${titleText}`.trim(),
            media: 'music',
            entity: 'album',
            limit: 10,
            country
          });
          candidates = (pass2 || []).filter(Boolean);
          logger.debug(`[AppleMusic] Country ${country} pass2 candidates=${candidates.length}`);
        }
        if (candidates.length > 0) {
          const isSingleOrEp = (name: string | undefined): boolean => /\b(single|ep)\b/i.test(name || '');
          let pool = candidates;
          const nonSingles = candidates.filter(c => !isSingleOrEp(c.collectionName));
          const albumLength = nonSingles.filter(c => typeof c.trackCount === 'number' ? c.trackCount >= 8 : true);
          if (albumLength.length > 0) pool = albumLength;
          else if (nonSingles.length > 0) pool = nonSingles;

          const exact = pool.filter(c => norm(c.collectionName || '') === wantTitle);
          const starts = exact.length === 0 ? pool.filter(c => norm(c.collectionName || '').startsWith(wantTitle)) : exact;
          const finalPool = (starts.length > 0 ? starts : pool);

          const best = finalPool
            .map(it => ({ it, score: scoreItem(it) }))
            .sort((x, y) => y.score - x.score)[0];
          if (best && best.score > 0) {
            result = best.it.collectionViewUrl || null;
            logger.info(`[AppleMusic] Selected in ${country}: name="${best.it.collectionName}", type=${best.it.collectionType}, tracks=${best.it.trackCount}, score=${best.score}, url=${result}`);
            if (result) break;
          }
        }
      }

      // Normalize result to universal Apple Music URL
      const normalizeToMusicHost = (u: string): string => {
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

      if (result) {
        result = normalizeToMusicHost(result);
      }

      // Fallback to Apple Music search URL
      const fallbackTerm = `${artistText} ${titleText}`.trim();
      const fallback = `https://music.apple.com/search?term=${encodeURIComponent(fallbackTerm)}`;
      if (!result) {
        logger.warn(`[AppleMusic] Falling back to search for album ${albumId} term="${fallbackTerm}"`);
      }
      const finalUrl = result || fallback;

      // Cache only if concrete album URL
      if (result) {
        try {
          await Album.updateUrls(albumId, { appleMusic: finalUrl });
        } catch (e: unknown) {
          const err = e as { message: string };
          console.warn('Failed to cache appleMusic URL:', err.message);
        }
      }

      return { url: finalUrl, cached: !!result };
    } catch (error) {
      console.error('Error resolving Apple Music URL:', error);
      throw error;
    }
  }

  // Calculate data quality score for an album
  calculateDataQuality(album: AlbumFormatted & { discs?: Array<{ number: number; tracks?: Array<{ no: number; title: string; durationSec: number | null }> }> }): DataQualityResult {
    let score = 0;
    let maxScore = 0;

    // Basic information (40 points)
    maxScore += 40;
    if (album.title) score += 10;
    if (album.artist && album.artist.length > 0) score += 10;
    if (album.releaseYear) score += 10;
    if (album.cover) score += 10;

    // Detailed metadata (30 points)
    maxScore += 30;
    if (album.labels && album.labels.length > 0) score += 5;
    if (album.genres && album.genres.length > 0) score += 5;
    if (album.barcode) score += 5;
    if (album.catalogNumber) score += 5;
    if (album.country) score += 5;

    // Track information (20 points)
    maxScore += 20;
    if (album.discs && album.discs.length > 0) {
      score += 10;
      const totalTracks = album.discs.reduce((sum, disc) => sum + (disc.tracks?.length || 0), 0);
      if (totalTracks > 0) score += 10;
    }

    // Ownership information (10 points)
    maxScore += 10;
    if (album.ownership?.condition) score += 3;
    if (album.ownership?.purchasedAt) score += 3;
    if (album.ownership?.priceChf) score += 2;
    if (album.ownership?.notes) score += 2;

    return {
      score: Math.round((score / maxScore) * 100),
      maxScore,
      details: {
        hasTitle: !!album.title,
        hasArtist: !!(album.artist && album.artist.length > 0),
        hasYear: !!album.releaseYear,
        hasCover: !!album.cover,
        hasLabels: !!(album.labels && album.labels.length > 0),
        hasGenres: !!(album.genres && album.genres.length > 0),
        hasBarcode: !!album.barcode,
        hasCatalogNumber: !!album.catalogNumber,
        hasCountry: !!album.country,
        hasTracks: !!(album.discs && album.discs.length > 0 && album.discs.some(disc => disc.tracks && disc.tracks.length > 0)),
        hasOwnership: !!(album.ownership?.condition || album.ownership?.purchasedAt || album.ownership?.priceChf || album.ownership?.notes)
      }
    };
  }

  async searchMusicBrainz(query: string): Promise<FormattedRelease[]> {
    try {
      const isArtistOnlyQuery = typeof query === 'string' && query.trim().toLowerCase().startsWith('artist:') && !query.includes(' AND ');
      const limit = isArtistOnlyQuery ? 400 : 10;
      const releases = await musicbrainzService.searchRelease(query, limit);
      const formatted = releases.map(release => musicbrainzService.formatReleaseData(release));
      console.log(`Searched MusicBrainz (fast mode): ${formatted.length} releases`);
      return formatted;
    } catch (error) {
      console.error('Error searching MusicBrainz:', error);
      throw error;
    }
  }

  async getMusicBrainzReleaseDetails(releaseId: string): Promise<FormattedRelease> {
    try {
      const release = await musicbrainzService.getReleaseDetails(releaseId);
      return musicbrainzService.formatReleaseData(release);
    } catch (error) {
      console.error('Error getting MusicBrainz release details:', error);
      throw error;
    }
  }

  async addAlbumFromMusicBrainz(releaseId: string, additionalData: AlbumData = {}): Promise<AlbumFormatted> {
    try {
      const releaseData = await musicbrainzService.getReleaseDetails(releaseId);
      const formattedData = musicbrainzService.formatReleaseData(releaseData);

      const coverArt = await musicbrainzService.getCoverArt(releaseId);
      console.log('Cover art for release', releaseId, ':', coverArt);
      let coverPath: string | null = null;
      let backCoverPath: string | null = null;

      const downloadAndResizeCover = async (url: string, type: string): Promise<string | null> => {
        if (!url) return null;
        try {
          const filename = `album_${releaseId}_${type}_${Date.now()}.jpg`;
          const pathUrl = await imageService.downloadImageFromUrl(url, 'cd', filename);
          if (pathUrl) {
            try {
              const downloadedFilename = pathUrl.split('/').pop()!;
              const fullPath = path.join(imageService.getLocalImagesDir(), 'cd', downloadedFilename);
              await imageService.resizeImage(fullPath, fullPath, 1200, 1200);
            } catch (resizeError: unknown) {
              const err = resizeError as { message: string };
              console.warn(`Failed to resize ${type} cover art:`, err.message);
            }
          }
          return pathUrl;
        } catch (error: unknown) {
          const err = error as { message: string };
          console.warn(`Failed to download ${type} cover art from url ${url}:`, err.message);
          return null;
        }
      };

      const selectedFrontUrl = additionalData?.coverArtData?.frontCoverUrl || null;
      const selectedBackUrl = additionalData?.coverArtData?.backCoverUrl || null;

      if (selectedFrontUrl && selectedBackUrl) {
        console.log('Using user-selected front/back covers (parallel download)');
        const [front, back] = await Promise.all([
          downloadAndResizeCover(selectedFrontUrl, 'front'),
          downloadAndResizeCover(selectedBackUrl, 'back')
        ]);
        coverPath = front;
        backCoverPath = back;
      } else {
        if (selectedFrontUrl) {
          console.log('Using user-selected front cover:', selectedFrontUrl);
          coverPath = await downloadAndResizeCover(selectedFrontUrl, 'front');
        }
        if (selectedBackUrl) {
          console.log('Using user-selected back cover:', selectedBackUrl);
          backCoverPath = await downloadAndResizeCover(selectedBackUrl, 'back');
        }
      }

      if (!coverPath && !backCoverPath && coverArt?.front?.url && coverArt?.back?.url) {
        const [front, back] = await Promise.all([
          downloadAndResizeCover(coverArt.front.url, 'front'),
          downloadAndResizeCover(coverArt.back.url, 'back')
        ]);
        coverPath = front;
        backCoverPath = back;
      } else {
        if (!coverPath && coverArt?.front?.url) {
          coverPath = await downloadAndResizeCover(coverArt.front.url, 'front');
        }
        if (!backCoverPath && coverArt?.back?.url) {
          backCoverPath = await downloadAndResizeCover(coverArt.back.url, 'back');
        }
      }

      const albumData: AlbumData = {
        ...(formattedData as unknown as AlbumData),
        ...additionalData,
        cover: coverPath,
        backCover: backCoverPath
      };

      console.log('Final album data cover:', albumData.cover);

      const existingAlbum = await Album.findByMusicbrainzId(releaseId);
      if (existingAlbum) {
        throw new Error('Album already exists in collection');
      }

      return await this.addAlbum(albumData);
    } catch (error) {
      console.error('Error adding album from MusicBrainz:', error);
      throw error;
    }
  }

  async addAlbumByBarcode(barcode: string, additionalData: AlbumData = {}): Promise<AlbumFormatted> {
    try {
      const releases = await musicbrainzService.getReleaseByBarcode(barcode);

      if (releases.length === 0) {
        throw new Error('No release found for this barcode');
      }

      const releaseId = releases[0].id;
      return await this.addAlbumFromMusicBrainz(releaseId, additionalData);
    } catch (error) {
      console.error('Error adding album by barcode:', error);
      throw error;
    }
  }

  async searchByCatalogNumber(catalogNumber: string): Promise<FormattedRelease[]> {
    try {
      const releases = await musicbrainzService.getReleaseByCatalogNumber(catalogNumber);
      return releases.map(release => musicbrainzService.formatReleaseData(release));
    } catch (error) {
      console.error('Error searching by catalog number:', error);
      throw error;
    }
  }

  async searchByBarcode(barcode: string): Promise<FormattedRelease[]> {
    try {
      const releases = await musicbrainzService.getReleaseByBarcode(barcode);
      return releases.map(release => musicbrainzService.formatReleaseData(release));
    } catch (error) {
      console.error('Error searching by barcode:', error);
      throw error;
    }
  }

  /**
   * Get autocomplete suggestions for a given field
   */
  async getAutocompleteSuggestions(field: string, value: string): Promise<AutocompleteRow[]> {
    const allowedFields = ['title', 'artist', 'genre', 'mood', 'track', 'label', 'country', 'year'];
    if (!allowedFields.includes(field)) {
      throw new Error(`Invalid field: ${field}`);
    }

    try {
      const rows = await Album.autocomplete(field, value);
      return rows;
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      throw error;
    }
  }
}

export default new MusicService();
