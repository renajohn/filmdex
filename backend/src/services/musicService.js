const Album = require('../models/album');
const Track = require('../models/track');
const musicbrainzService = require('./musicBrainzService');
const imageService = require('./imageService');

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

  async searchCds(query) {
    try {
      return await Album.search(query);
    } catch (error) {
      console.error('Error searching CDs:', error);
      throw error;
    }
  }

  async getAllCds() {
    try {
      return await Album.findAll();
    } catch (error) {
      console.error('Error getting all CDs:', error);
      throw error;
    }
  }

  async getCdById(id) {
    try {
      const cd = await Album.findById(id);
      if (!cd) {
        throw new Error('CD not found');
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
        ...cd,
        discs: discsArray
      };
    } catch (error) {
      console.error('Error getting CD by ID:', error);
      throw error;
    }
  }

  async addCd(cdData) {
    try {
      // Create the CD
      const cd = await Album.create(cdData);
      
      // Add tracks if provided
      if (cdData.discs && cdData.discs.length > 0) {
        console.log(`Adding ${cdData.discs.length} disc(s) with tracks for album ID: ${cd.id}`);
        for (const disc of cdData.discs) {
          console.log(`  Disc ${disc.number}: ${disc.tracks?.length || 0} tracks`);
          for (const track of disc.tracks) {
            try {
              await Track.create({
                cdId: cd.id,
                albumId: cd.id,
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
        console.log(`Successfully added tracks for album ID: ${cd.id}`);
      } else {
        console.log('No tracks to add for this album');
      }

      return cd;
    } catch (error) {
      console.error('Error adding CD:', error);
      throw error;
    }
  }

  async updateCd(id, cdData) {
    try {
      // Update the CD
      const cd = await Album.update(id, cdData);
      
      // Update tracks if provided
      if (cdData.discs && cdData.discs.length > 0) {
        // Delete existing tracks
        console.log(`Deleting existing tracks for album ID: ${id}`);
        await Track.deleteByCdId(id);
        
        // Add new tracks
        console.log(`Adding ${cdData.discs.length} disc(s) with tracks for album ID: ${id}`);
        for (const disc of cdData.discs) {
          console.log(`  Disc ${disc.number}: ${disc.tracks?.length || 0} tracks`);
          for (const track of disc.tracks) {
            try {
              await Track.create({
                cdId: id,
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

      return cd;
    } catch (error) {
      console.error('Error updating CD:', error);
      throw error;
    }
  }

  async deleteCd(id) {
    try {
      // Tracks will be deleted automatically due to foreign key constraint
      const result = await Album.delete(id);
      return result;
    } catch (error) {
      console.error('Error deleting CD:', error);
      throw error;
    }
  }

  // Calculate data quality score for a CD
  calculateDataQuality(cd) {
    let score = 0;
    let maxScore = 0;
    
    // Basic information (40 points)
    maxScore += 40;
    if (cd.title) score += 10;
    if (cd.artist && cd.artist.length > 0) score += 10;
    if (cd.releaseYear) score += 10;
    if (cd.cover) score += 10;
    
    // Detailed metadata (30 points)
    maxScore += 30;
    if (cd.labels && cd.labels.length > 0) score += 5;
    if (cd.genres && cd.genres.length > 0) score += 5;
    if (cd.moods && cd.moods.length > 0) score += 5;
    if (cd.barcode) score += 5;
    if (cd.catalogNumber) score += 5;
    if (cd.country) score += 5;
    
    // Track information (20 points)
    maxScore += 20;
    if (cd.discs && cd.discs.length > 0) {
      score += 10; // Has disc structure
      const totalTracks = cd.discs.reduce((sum, disc) => sum + (disc.tracks?.length || 0), 0);
      if (totalTracks > 0) score += 10; // Has tracks
    }
    
    // Ownership information (10 points)
    maxScore += 10;
    if (cd.ownership?.condition) score += 3;
    if (cd.ownership?.purchasedAt) score += 3;
    if (cd.ownership?.priceChf) score += 2;
    if (cd.ownership?.notes) score += 2;
    
    return {
      score: Math.round((score / maxScore) * 100),
      maxScore,
      details: {
        hasTitle: !!cd.title,
        hasArtist: !!(cd.artist && cd.artist.length > 0),
        hasYear: !!cd.releaseYear,
        hasCover: !!cd.cover,
        hasLabels: !!(cd.labels && cd.labels.length > 0),
        hasGenres: !!(cd.genres && cd.genres.length > 0),
        hasMoods: !!(cd.moods && cd.moods.length > 0),
        hasBarcode: !!cd.barcode,
        hasCatalogNumber: !!cd.catalogNumber,
        hasCountry: !!cd.country,
        hasTracks: !!(cd.discs && cd.discs.length > 0 && cd.discs.some(disc => disc.tracks && disc.tracks.length > 0)),
        hasOwnership: !!(cd.ownership?.condition || cd.ownership?.purchasedAt || cd.ownership?.priceChf || cd.ownership?.notes)
      }
    };
  }

  async searchMusicBrainz(query) {
    try {
      const releases = await musicbrainzService.searchRelease(query);
      const formatted = releases.map(release => {
        const formattedRelease = musicbrainzService.formatReleaseData(release);
        console.log('Original release coverArt:', release.coverArt);
        console.log('Formatted release coverArt:', formattedRelease.coverArt);
        return formattedRelease;
      });
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

  async addCdFromMusicBrainz(releaseId, additionalData = {}) {
    try {
      // Get release details from MusicBrainz
      const releaseData = await musicbrainzService.getReleaseDetails(releaseId);
      const formattedData = musicbrainzService.formatReleaseData(releaseData);
      
      // Get cover art
      const coverArt = await musicbrainzService.getCoverArt(releaseId);
      let coverPath = null;
      
      if (coverArt) {
        try {
          // Download and save cover image from MusicBrainz URL
          const filename = `cd_${releaseId}_${Date.now()}.jpg`;
          coverPath = await imageService.downloadImageFromUrl(coverArt.url, 'cd', filename);
        } catch (coverError) {
          console.warn('Failed to download cover art:', coverError.message);
        }
      }

      // Extract moods from tags based on mood-related keywords
      const moodKeywords = ['calm', 'energetic', 'melancholic', 'happy', 'sad', 'aggressive', 'mellow', 'upbeat', 'dark', 'bright', 'atmospheric', 'emotional', 'romantic', 'angry', 'peaceful', 'intense', 'relaxing', 'soothing', 'cheerful', 'dreamy', 'night', 'day', 'morning', 'evening'];
      const moods = formattedData.tags?.filter(tag => 
        moodKeywords.some(keyword => tag.toLowerCase().includes(keyword))
      ) || [];

      // Prepare CD data
      const cdData = {
        ...formattedData,
        moods: moods.length > 0 ? moods : formattedData.moods || [],
        cover: coverPath,
        ...additionalData
      };

      // Check if CD already exists
      const existingCd = await Album.findByMusicbrainzId(releaseId);
      if (existingCd) {
        throw new Error('CD already exists in collection');
      }

      // Add the CD
      return await this.addCd(cdData);
    } catch (error) {
      console.error('Error adding CD from MusicBrainz:', error);
      throw error;
    }
  }

  async addCdByBarcode(barcode, additionalData = {}) {
    try {
      // Search MusicBrainz by barcode
      const releases = await musicbrainzService.getReleaseByBarcode(barcode);
      
      if (releases.length === 0) {
        throw new Error('No release found for this barcode');
      }

      // Use the first release found
      const releaseId = releases[0].id;
      return await this.addCdFromMusicBrainz(releaseId, additionalData);
    } catch (error) {
      console.error('Error adding CD by barcode:', error);
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
    const allowedFields = ['title', 'artist', 'genre', 'mood'];
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
