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
      // Use all tags as moods if moods not already present
      // Users can remove unwanted ones manually
      if ((!albumData.moods || albumData.moods.length === 0) && albumData.tags && albumData.tags.length > 0) {
        albumData.moods = albumData.tags;
      }

      // Create the album
      const album = await Album.create(albumData);
      
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
    if (album.moods && album.moods.length > 0) score += 5;
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
        hasMoods: !!(album.moods && album.moods.length > 0),
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
      const releases = await musicbrainzService.searchRelease(query);
      const formatted = releases.map(release => {
        return musicbrainzService.formatReleaseData(release);
      });
      
      const releasesWithCover = formatted.filter(r => r.coverArt?.url).length;
      console.log(`Searched MusicBrainz: ${formatted.length} releases, ${releasesWithCover} with cover art`);
      
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
      let coverPath = null;
      
      if (coverArt) {
        try {
          // Download and save cover image from MusicBrainz URL
          const filename = `album_${releaseId}_${Date.now()}.jpg`;
          coverPath = await imageService.downloadImageFromUrl(coverArt.url, 'cd', filename);
        } catch (coverError) {
          console.warn('Failed to download cover art:', coverError.message);
        }
      }

      // Use all tags as moods - users can remove unwanted ones manually
      const moods = formattedData.tags || [];

      // Prepare album data
      const albumData = {
        ...formattedData,
        moods: moods.length > 0 ? moods : formattedData.moods || [],
        cover: coverPath,
        ...additionalData
      };

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
