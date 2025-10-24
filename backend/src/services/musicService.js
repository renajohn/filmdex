const Album = require('../models/album');
const Track = require('../models/track');
const musicbrainzService = require('./musicbrainzService');
const imageService = require('./imageService');
const axios = require('axios');
const logger = require('../logger');

class MusicService {
  async initializeTables() {
    try {
      await Album.createTable();
      await Track.createTable();
      console.log('Music tables initialized successfully');
    } catch (error) {
      console.error('Error initializing music tables:', error);
      throw error;
    }
  }

  async searchAlbums(query) {
    try {
      return await Album.search(query);
    } catch (error) {
      console.error('Error searching albums:', error);
      throw error;
    }
  }

  async getAllAlbums() {
    try {
      return await Album.findAll();
    } catch (error) {
      console.error('Error getting all albums:', error);
      throw error;
    }
  }

  async getAlbumsByStatus(status) {
    try {
      return await Album.findByStatus(status);
    } catch (error) {
      console.error('Error getting albums by status:', error);
      throw error;
    }
  }

  async updateAlbumStatus(id, status) {
    try {
      return await Album.updateStatus(id, status);
    } catch (error) {
      console.error('Error updating album status:', error);
      throw error;
    }
  }

  async getAlbumById(id) {
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
      const discs = {};
      tracks.forEach(track => {
        if (!discs[track.discNumber]) {
          discs[track.discNumber] = [];
        }
        discs[track.discNumber].push(track);
      });

      // Convert to array format
      const discsArray = Object.keys(discs).map(discNumber => ({
        number: parseInt(discNumber),
        tracks: discs[discNumber].map(track => ({
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

  async addAlbum(albumData) {
    try {
      // Create the album
      let album = await Album.create(albumData);
      
      // Ensure covers are persisted even if model mapping missed them
      const needsFrontPersist = albumData.cover && (!album.cover || album.cover.trim() === '');
      const needsBackPersist = albumData.backCover && (!album.backCover || album.backCover.trim() === '');
      if (needsFrontPersist) {
        try {
          await Album.updateFrontCover(album.id, albumData.cover);
        } catch (e) {
          console.warn(`Failed to persist front cover for album ${album.id}:`, e.message);
        }
      }
      if (needsBackPersist) {
        try {
          await Album.updateBackCover(album.id, albumData.backCover);
        } catch (e) {
          console.warn(`Failed to persist back cover for album ${album.id}:`, e.message);
        }
      }
      if (needsFrontPersist || needsBackPersist) {
        // Refresh album to include updated cover fields
        album = await Album.findById(album.id);
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
                trackNumber: track.trackNumber || track.no, // Handle both formats
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

  async updateAlbum(id, albumData) {
    try {
      // Update the album
      const album = await Album.update(id, albumData);
      
      // Update tracks if provided
      if (albumData.discs && albumData.discs.length > 0) {
        // Delete existing tracks
        console.log(`Deleting existing tracks for album ID: ${id}`);
        await Track.deleteByCdId(id);
        
        // Add new tracks
        console.log(`Adding ${albumData.discs.length} disc(s) with tracks for album ID: ${id}`);
        for (const disc of albumData.discs) {
          console.log(`  Disc ${disc.number}: ${disc.tracks?.length || 0} tracks`);
          for (const track of disc.tracks) {
            try {
              await Track.create({
                albumId: id,
                discNumber: disc.number,
                trackNumber: track.trackNumber || track.no, // Handle both formats
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

  async deleteAlbum(id) {
    try {
      // Tracks will be deleted automatically due to foreign key constraint
      const result = await Album.delete(id);
      return result;
    } catch (error) {
      console.error('Error deleting album:', error);
      throw error;
    }
  }

  // Resolve and cache Apple Music album URL
  async getAppleMusicUrl(albumId) {
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
          } catch (_) {}
          return { url: existingApple, cached: true };
        }
      }

      // Build normalized helpers
      const artistText = Array.isArray(album.artist) ? album.artist.join(' ') : (album.artist || '');
      const titleText = album.title || '';
      const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const wantArtist = norm(artistText);
      const wantTitle = norm(titleText);

      // Countries to try (start local, then common stores)
      const countries = ['CH', 'US', 'GB', 'DE', 'FR'];

      logger.info(`[AppleMusic] Resolving URL for album ${albumId}: title="${titleText}", artist="${artistText}", barcode=${album.barcode || '-'} isrcs_in_album=${Array.isArray(album.isrcCodes) ? album.isrcCodes.length : 0}`);

      // 1) Try UPC/EAN (barcode) exact lookup
      if (album.barcode) {
        for (const country of countries) {
          try {
            const resp = await axios.get('https://itunes.apple.com/lookup', {
              params: { upc: album.barcode, entity: 'album', country },
              timeout: 8000
            });
            const items = resp.data?.results || [];
            logger.debug(`[AppleMusic] UPC lookup country=${country} results=${items.length}`);
            const found = items.find(it => it.collectionViewUrl);
            if (found && found.collectionViewUrl) {
              const url = found.collectionViewUrl;
              logger.info(`[AppleMusic] UPC match for album ${albumId} in ${country}: ${url}`);
              try { await Album.updateUrls(albumId, { appleMusic: url }); } catch (_) {}
              return { url, cached: true };
            }
          } catch (_) {
            // try next country
          }
        }
      }

      // 2) Try ISRC-based lookup (from album or tracks)
      let isrcList = Array.isArray(album.isrcCodes) ? album.isrcCodes.filter(Boolean) : [];
      if (!isrcList || isrcList.length === 0) {
        try {
          const tracks = await Track.findByCdId(albumId);
          isrcList = Array.from(new Set(tracks.map(t => t.isrc).filter(Boolean)));
        } catch (_) {}
      }
      if (isrcList && isrcList.length > 0) {
        for (const isrc of isrcList) {
          for (const country of countries) {
            try {
              const resp = await axios.get('https://itunes.apple.com/lookup', {
                params: { isrc, country },
                timeout: 8000
              });
              const items = resp.data?.results || [];
              logger.debug(`[AppleMusic] ISRC lookup isrc=${isrc} country=${country} results=${items.length}`);
              // Prefer items that include collectionViewUrl (album)
              const withCollection = items.find(it => it.collectionViewUrl);
              if (withCollection && withCollection.collectionViewUrl) {
                const url = withCollection.collectionViewUrl;
                logger.info(`[AppleMusic] ISRC match for album ${albumId} isrc=${isrc} country=${country}: ${url}`);
                try { await Album.updateUrls(albumId, { appleMusic: url }); } catch (_) {}
                return { url, cached: true };
              }
            } catch (_) {
              // try next
            }
          }
        }
      }

      // Two-pass strategy: precise album title first, then broader search
      async function searchItunes(params) {
        try {
          const resp = await axios.get(`https://itunes.apple.com/search`, { params, timeout: 8000 });
          return resp.data?.results || [];
        } catch (_) {
          return [];
        }
      }

      const scoreItem = (it) => {
        const a = norm(it.artistName);
        const t = norm(it.collectionName);
        let score = 0;
        // Prefer true albums
        if (it.collectionType === 'Album' || it.collectionType === 'Compilation') score += 2;
        // Exact matches get a big boost
        if (t === wantTitle) score += 3;
        if (a === wantArtist) score += 3;
        // Token containment
        if (wantArtist && a.includes(wantArtist)) score += 2;
        if (wantTitle) {
          const words = wantTitle.split(' ').filter(Boolean);
          if (t.includes(wantTitle) || words.every(w => t.includes(w))) score += 2;
        }
        // Penalize singles/EPs unless title says so
        const isLikelySingle = /\b(single|ep)\b/i.test(it.collectionName || '');
        const titleSaysSingle = /\b(single|ep)\b/i.test(titleText || '');
        if (isLikelySingle && !titleSaysSingle) score -= 3;
        // Prefer reasonable album lengths
        if (typeof it.trackCount === 'number') {
          if (it.trackCount >= 6) score += 1;
          if (it.trackCount <= 2 && !titleSaysSingle) score -= 1;
        }
        // Year proximity
        if (album.releaseYear && it.releaseDate) {
          const y = new Date(it.releaseDate).getFullYear();
          if (Math.abs(y - album.releaseYear) <= 1) score += 1;
        }
        return score;
      };

      let result = null;
      for (const country of countries) {
        // Pass 1: albumTerm focused on title
        const pass1 = await searchItunes({
          term: titleText,
          media: 'music',
          entity: 'album',
          attribute: 'albumTerm',
          limit: 10,
          country
        });
        let candidates = pass1.filter(Boolean);
        logger.debug(`[AppleMusic] Country ${country} pass1 candidates=${candidates.length}`);
        // Filter to artist match if possible
        if (wantArtist) {
          candidates = candidates.filter(it => norm(it.artistName).includes(wantArtist));
        }
        // If none or weak, pass 2: artist + title
        if (candidates.length === 0) {
          const pass2 = await searchItunes({
            term: `${artistText} ${titleText}`.trim(),
            media: 'music',
            entity: 'album',
            limit: 10,
            country
          });
          candidates = pass2.filter(Boolean);
          logger.debug(`[AppleMusic] Country ${country} pass2 candidates=${candidates.length}`);
        }
        if (candidates.length > 0) {
          const isSingleOrEp = (name) => /\b(single|ep)\b/i.test(name || '');
          // Prefer non-single/EP if available
          let pool = candidates;
          const nonSingles = candidates.filter(c => !isSingleOrEp(c.collectionName));
          const albumLength = nonSingles.filter(c => typeof c.trackCount === 'number' ? c.trackCount >= 8 : true);
          if (albumLength.length > 0) pool = albumLength;
          else if (nonSingles.length > 0) pool = nonSingles;

          // Prefer exact title match pool if exists
          const exact = pool.filter(c => norm(c.collectionName) === wantTitle);
          const starts = exact.length === 0 ? pool.filter(c => norm(c.collectionName).startsWith(wantTitle)) : exact;
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
        } catch (e) {
          // Non-fatal if caching fails
          console.warn('Failed to cache appleMusic URL:', e.message);
        }
      }

      return { url: finalUrl, cached: !!result };
    } catch (error) {
      console.error('Error resolving Apple Music URL:', error);
      throw error;
    }
  }

  // Calculate data quality score for an album
  calculateDataQuality(album) {
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
      score += 10; // Has disc structure
      const totalTracks = album.discs.reduce((sum, disc) => sum + (disc.tracks?.length || 0), 0);
      if (totalTracks > 0) score += 10; // Has tracks
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

  async searchMusicBrainz(query) {
    try {
      // Bump limit for artist-only searches to return many releases across albums
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

  async getMusicBrainzReleaseDetails(releaseId) {
    try {
      const release = await musicbrainzService.getReleaseDetails(releaseId);
      return musicbrainzService.formatReleaseData(release);
    } catch (error) {
      console.error('Error getting MusicBrainz release details:', error);
      throw error;
    }
  }

  async addAlbumFromMusicBrainz(releaseId, additionalData = {}) {
    try {
      // Get release details from MusicBrainz
      const releaseData = await musicbrainzService.getReleaseDetails(releaseId);
      const formattedData = musicbrainzService.formatReleaseData(releaseData);
      
      // Get cover art
      const coverArt = await musicbrainzService.getCoverArt(releaseId);
      console.log('Cover art for release', releaseId, ':', coverArt);
      let coverPath = null;
      let backCoverPath = null;
      
      // Helper to download and resize a cover
      const downloadAndResizeCover = async (url, type) => {
        if (!url) return null;
        try {
          const filename = `album_${releaseId}_${type}_${Date.now()}.jpg`;
          const pathUrl = await imageService.downloadImageFromUrl(url, 'cd', filename);
          if (pathUrl) {
            try {
              const path = require('path');
              const downloadedFilename = pathUrl.split('/').pop();
              const fullPath = path.join(imageService.getLocalImagesDir(), 'cd', downloadedFilename);
              await imageService.resizeImage(fullPath, fullPath, 1200, 1200);
            } catch (resizeError) {
              console.warn(`Failed to resize ${type} cover art:`, resizeError.message);
            }
          }
          return pathUrl;
        } catch (error) {
          console.warn(`Failed to download ${type} cover art from url ${url}:`, error.message);
          return null;
        }
      };
      
      // Prefer user-selected cover URLs from the frontend if provided
      const selectedFrontUrl = additionalData?.coverArtData?.frontCoverUrl || null;
      const selectedBackUrl = additionalData?.coverArtData?.backCoverUrl || null;

      // Download selected covers if provided
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

      // Fallback to MusicBrainz covers only if not provided or download failed
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

      // Prepare album data
      const albumData = {
        ...formattedData,
        ...additionalData,
        // Respect user-selected covers if provided; use whatever was successfully downloaded
        cover: coverPath,
        backCover: backCoverPath
      };
      
      console.log('Final album data cover:', albumData.cover);

      // Check if album already exists
      const existingAlbum = await Album.findByMusicbrainzId(releaseId);
      if (existingAlbum) {
        throw new Error('Album already exists in collection');
      }

      // Add the album
      return await this.addAlbum(albumData);
    } catch (error) {
      console.error('Error adding album from MusicBrainz:', error);
      throw error;
    }
  }

  async addAlbumByBarcode(barcode, additionalData = {}) {
    try {
      // Search MusicBrainz by barcode
      const releases = await musicbrainzService.getReleaseByBarcode(barcode);
      
      if (releases.length === 0) {
        throw new Error('No release found for this barcode');
      }

      // Use the first release found
      const releaseId = releases[0].id;
      return await this.addAlbumFromMusicBrainz(releaseId, additionalData);
    } catch (error) {
      console.error('Error adding album by barcode:', error);
      throw error;
    }
  }

  async searchByCatalogNumber(catalogNumber) {
    try {
      const releases = await musicbrainzService.getReleaseByCatalogNumber(catalogNumber);
      return releases.map(release => musicbrainzService.formatReleaseData(release));
    } catch (error) {
      console.error('Error searching by catalog number:', error);
      throw error;
    }
  }

  async searchByBarcode(barcode) {
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
  async getAutocompleteSuggestions(field, value) {
    // Validate field to prevent injection
    const allowedFields = ['title', 'artist', 'genre', 'mood', 'track'];
    if (!allowedFields.includes(field)) {
      throw new Error(`Invalid field: ${field}`);
    }
    
    try {
      const rows = await Album.autocomplete(field, value);
      
      // Rows are already in the correct format from Album.autocomplete
      return rows;
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      throw error;
    }
  }
}

module.exports = new MusicService();
