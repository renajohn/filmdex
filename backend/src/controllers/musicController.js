const multer = require('multer');
const path = require('path');
const fs = require('fs');
const musicService = require('../services/musicService');
const imageService = require('../services/imageService');
const musicbrainzService = require('../services/musicbrainzService');
const Album = require('../models/album');
const { getDatabase } = require('../database');
const logger = require('../logger');

// Configure multer for cover uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const customCoverDir = path.join(imageService.getLocalImagesDir(), 'cd', 'custom');
    // Ensure directory exists
    if (!fs.existsSync(customCoverDir)) {
      fs.mkdirSync(customCoverDir, { recursive: true });
    }
    cb(null, customCoverDir);
  },
  filename: (req, file, cb) => {
    const cdId = req.params.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `cd_${cdId}_${timestamp}${ext}`);
  }
});

const coverUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
  }
});

const musicController = {
  // Get all albums
  getAllAlbums: async (req, res) => {
    try {
      const albums = await musicService.getAllAlbums();
      res.json(albums);
    } catch (error) {
      console.error('Error getting all albums:', error);
      res.status(500).json({ error: 'Failed to get albums' });
    }
  },

  // Get albums by status (owned or wish)
  getAlbumsByStatus: async (req, res) => {
    try {
      const { status } = req.params;
      if (!['owned', 'wish'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "owned" or "wish"' });
      }
      
      const albums = await musicService.getAlbumsByStatus(status);
      res.json(albums);
    } catch (error) {
      console.error('Error getting albums by status:', error);
      res.status(500).json({ error: 'Failed to get albums by status' });
    }
  },

  // Update album status
  updateAlbumStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!['owned', 'wish'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "owned" or "wish"' });
      }
      
      const result = await musicService.updateAlbumStatus(id, status);
      res.json(result);
    } catch (error) {
      console.error('Error updating album status:', error);
      res.status(500).json({ error: 'Failed to update album status' });
    }
  },

  // Get album by ID
  getAlbumById: async (req, res) => {
    try {
      const { id } = req.params;
      const album = await musicService.getAlbumById(id);
      res.json(album);
    } catch (error) {
      console.error('Error getting album by ID:', error);
      if (error.message === 'Album not found') {
        res.status(404).json({ error: 'Album not found' });
      } else {
        res.status(500).json({ error: 'Failed to get album' });
      }
    }
  },

  // Add new album
  addAlbum: async (req, res) => {
    try {
      const albumData = req.body;
      console.log('=== ADD ALBUM REQUEST ===');
      console.log('Has discs:', !!albumData.discs);
      console.log('Discs length:', albumData.discs?.length);
      if (albumData.discs && albumData.discs.length > 0) {
        albumData.discs.forEach((disc, idx) => {
          console.log(`  Disc ${idx + 1}: ${disc.tracks?.length || 0} tracks`);
        });
      }
      const album = await musicService.addAlbum(albumData);
      res.status(201).json(album);
    } catch (error) {
      console.error('Error adding album:', error);
      res.status(500).json({ error: 'Failed to add album' });
    }
  },

  // Update album
  updateAlbum: async (req, res) => {
    try {
      const { id } = req.params;
      const albumData = req.body;
      const album = await musicService.updateAlbum(id, albumData);
      res.json(album);
    } catch (error) {
      console.error('Error updating album:', error);
      res.status(500).json({ error: 'Failed to update album' });
    }
  },

  // Delete album
  deleteAlbum: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await musicService.deleteAlbum(id);
      if (result.deleted) {
        res.json({ message: 'Album deleted successfully' });
      } else {
        res.status(404).json({ error: 'Album not found' });
      }
    } catch (error) {
      console.error('Error deleting album:', error);
      res.status(500).json({ error: 'Failed to delete album' });
    }
  },

  // Search albums
  searchAlbums: async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({ error: 'Search query is required' });
      }
      
      const albums = await musicService.searchAlbums(q);
      res.json(albums);
    } catch (error) {
      console.error('Error searching albums:', error);
      res.status(500).json({ error: 'Failed to search albums' });
    }
  },

  // Search MusicBrainz
  searchMusicBrainz: async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({ error: 'Search query is required' });
      }
      
      const releases = await musicService.searchMusicBrainz(q);
      res.json(releases);
    } catch (error) {
      console.error('Error searching MusicBrainz:', error);
      res.status(500).json({ error: 'Failed to search MusicBrainz' });
    }
  },

  // Get cover art metadata for a specific MusicBrainz release (front/back URLs + thumbnails)
  getCoverArt: async (req, res) => {
    try {
      const { releaseId } = req.params;
      if (!releaseId) {
        return res.status(400).json({ error: 'releaseId is required' });
      }
      const coverArt = await musicbrainzService.getCoverArt(releaseId);
      res.json(coverArt || {});
    } catch (error) {
      console.error('Error getting cover art:', error);
      res.status(500).json({ error: 'Failed to get cover art' });
    }
  },

  // Get MusicBrainz release details
  getMusicBrainzReleaseDetails: async (req, res) => {
    try {
      const { releaseId } = req.params;
      const release = await musicService.getMusicBrainzReleaseDetails(releaseId);
      res.json(release);
    } catch (error) {
      console.error('Error getting MusicBrainz release details:', error);
      res.status(500).json({ error: 'Failed to get release details' });
    }
  },

  // Add album from MusicBrainz
  addAlbumFromMusicBrainz: async (req, res) => {
    try {
      const { releaseId } = req.params;
      const additionalData = req.body || {};
      
      const album = await musicService.addAlbumFromMusicBrainz(releaseId, additionalData);
      res.status(201).json(album);
    } catch (error) {
      console.error('Error adding album from MusicBrainz:', error);
      if (error.message === 'Album already exists in collection') {
        res.status(409).json({ error: 'Album already exists in collection' });
      } else {
        res.status(500).json({ error: 'Failed to add album from MusicBrainz' });
      }
    }
  },

  // Add album by barcode
  addAlbumByBarcode: async (req, res) => {
    try {
      const { barcode } = req.params;
      const additionalData = req.body || {};
      
      const album = await musicService.addAlbumByBarcode(barcode, additionalData);
      res.status(201).json(album);
    } catch (error) {
      console.error('Error adding album by barcode:', error);
      if (error.message === 'No release found for this barcode') {
        res.status(404).json({ error: 'No release found for this barcode' });
      } else {
        res.status(500).json({ error: 'Failed to add album by barcode' });
      }
    }
  },

  searchByCatalogNumber: async (req, res) => {
    try {
      const { catalogNumber } = req.query;
      
      if (!catalogNumber) {
        return res.status(400).json({ error: 'Catalog number is required' });
      }
      
      const releases = await musicService.searchByCatalogNumber(catalogNumber);
      res.json(releases);
    } catch (error) {
      console.error('Error searching by catalog number:', error);
      res.status(500).json({ error: 'Failed to search by catalog number' });
    }
  },

  searchByBarcode: async (req, res) => {
    try {
      const { barcode } = req.query;
      
      if (!barcode) {
        return res.status(400).json({ error: 'Barcode is required' });
      }
      
      const releases = await musicService.searchByBarcode(barcode);
      res.json(releases);
    } catch (error) {
      console.error('Error searching by barcode:', error);
      res.status(500).json({ error: 'Failed to search by barcode' });
    }
  },

  // Get or resolve Apple Music URL for an album
  getAppleMusicUrl: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await musicService.getAppleMusicUrl(id);
      res.json(result);
    } catch (error) {
      console.error('Error getting Apple Music URL:', error);
      res.status(500).json({ error: 'Failed to resolve Apple Music URL' });
    }
  },

  // Get autocomplete suggestions
  getAutocompleteSuggestions: async (req, res) => {
    try {
      const { field, value } = req.query;
      
      if (!field) {
        return res.status(400).json({ error: 'Field parameter is required' });
      }
      
      const suggestions = await musicService.getAutocompleteSuggestions(field, value || '');
      res.json(suggestions);
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      res.status(500).json({ error: 'Failed to get autocomplete suggestions' });
    }
  },

  // Upload custom cover for a CD
  uploadCustomCover: async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const file = req.file;
      logger.info(`Uploading custom cover for CD ${id}: ${file.filename}`);

      // Resize the image to max 1000x1000
      let width = 500;
      let height = 500;
      
      try {
        await imageService.resizeImage(file.path, file.path, 1000, 1000);
        
        // Get updated dimensions after resize
        const sharp = require('sharp');
        const metadata = await sharp(file.path).metadata();
        width = metadata.width;
        height = metadata.height;
        logger.info(`Cover resized to ${width}x${height}`);
      } catch (error) {
        // If resize fails, log but continue
        logger.warn('Failed to resize cover image:', error.message);
      }

      // Construct the cover path using API endpoint (works with Home Assistant ingress)
      const coverPath = `/api/images/cd/custom/${file.filename}`;

      // Update only the cover field without affecting other data
      const db = require('../database').getDatabase();
      await new Promise((resolve, reject) => {
        const sql = 'UPDATE albums SET cover = ? WHERE id = ?';
        db.run(sql, [coverPath, id], function(err) {
          if (err) {
            logger.error(`Failed to update cover for album ${id}:`, err);
            reject(err);
          } else {
            logger.info(`Updated album ${id} with custom cover: ${coverPath}`);
            resolve();
          }
        });
      });

      res.json({
        success: true,
        coverPath: coverPath,
        filename: file.filename,
        width,
        height
      });
    } catch (error) {
      logger.error('Error uploading custom cover:', error);
      res.status(500).json({ error: 'Failed to upload custom cover' });
    }
  },

  uploadCustomBackCover: async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const file = req.file;
      logger.info(`Uploading custom back cover for CD ${id}: ${file.filename}`);

      // Resize the image to max 1200x1200
      let width = 500;
      let height = 500;
      
      try {
        await imageService.resizeImage(file.path, file.path, 1200, 1200);
        
        // Get updated dimensions after resize
        const sharp = require('sharp');
        const metadata = await sharp(file.path).metadata();
        width = metadata.width;
        height = metadata.height;
        logger.info(`Back cover resized to ${width}x${height}`);
      } catch (error) {
        // If resize fails, log but continue
        logger.warn('Failed to resize back cover image:', error.message);
      }

      // Construct the back cover path using API endpoint (works with Home Assistant ingress)
      const backCoverPath = `/api/images/cd/custom/${file.filename}`;

      // Update only the back_cover field without affecting other data
      const db = require('../database').getDatabase();
      await new Promise((resolve, reject) => {
        const sql = 'UPDATE albums SET back_cover = ? WHERE id = ?';
        db.run(sql, [backCoverPath, id], function(err) {
          if (err) {
            logger.error(`Failed to update back cover for album ${id}:`, err);
            reject(err);
          } else {
            logger.info(`Updated album ${id} with custom back cover: ${backCoverPath}`);
            resolve();
          }
        });
      });

      res.json({
        success: true,
        backCoverPath: backCoverPath,
        filename: file.filename,
        width,
        height
      });
    } catch (error) {
      logger.error('Error uploading custom back cover:', error);
      res.status(500).json({ error: 'Failed to upload custom back cover' });
    }
  },

  // Migrate existing album covers: download external URLs and resize all to 1000x1000
  resizeAllAlbumCovers: async (req, res) => {
    try {
      logger.info('Starting album cover migration (download + resize)...');
      
      const Album = require('../models/album');
      const path = require('path');
      const fs = require('fs');
      const db = require('../database').getDatabase();
      
      // Get all albums with covers (including wish list albums for migration)
      const allAlbums = await new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM albums WHERE cover IS NOT NULL AND cover != "" ORDER BY title';
        db.all(sql, [], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(Album.formatRow));
          }
        });
      });
      const albumsWithCovers = allAlbums;
      
      logger.info(`Found ${albumsWithCovers.length} albums with covers to process`);
      
      let processed = 0;
      let downloaded = 0;
      let resized = 0;
      let skipped = 0;
      let errors = 0;
      const errorDetails = [];
      
      for (const album of albumsWithCovers) {
        try {
          const coverPath = album.cover;
          logger.debug(`Processing album ${album.id} (${album.title}): ${coverPath}`);
          
          let localPath = null;
          let needsDownload = false;
          
          // Check if cover is an external URL
          if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
            logger.info(`Downloading external cover for album ${album.id}: ${coverPath}`);
            needsDownload = true;
            
            // Generate filename for downloaded cover
            const urlParts = coverPath.split('/');
            const originalFilename = urlParts[urlParts.length - 1];
            const extension = path.extname(originalFilename) || '.jpg';
            const filename = `album_${album.id}_${Date.now()}${extension}`;
            
            try {
              // Download the image
              localPath = await imageService.downloadImageFromUrl(coverPath, 'cd', filename);
              
              if (localPath) {
                downloaded++;
                logger.info(`Downloaded cover for album ${album.id}: ${localPath}`);
                
                // Convert URL path to actual file system path for resizing
                const urlPath = localPath; // Keep the URL path for database
                const actualFilePath = path.join(imageService.getLocalImagesDir(), 'cd', filename);
                
                // Update database with local path
                await new Promise((resolve, reject) => {
                  const sql = 'UPDATE albums SET cover = ? WHERE id = ?';
                  db.run(sql, [urlPath, album.id], function(err) {
                    if (err) {
                      logger.error(`Failed to update cover path for album ${album.id}:`, err);
                      reject(err);
                    } else {
                      logger.info(`Updated database for album ${album.id} with local path: ${urlPath}`);
                      resolve();
                    }
                  });
                });
                
                // Set the actual file path for resizing
                localPath = actualFilePath;
              } else {
                throw new Error('Failed to download cover');
              }
            } catch (downloadError) {
              logger.error(`Failed to download cover for album ${album.id}:`, downloadError);
              errors++;
              errorDetails.push({ albumId: album.id, title: album.title, error: `Download failed: ${downloadError.message}` });
              processed++;
              continue;
            }
          } else {
            // Cover is already local, find the file
            const filename = coverPath.split('/').pop();
            
            // Check if file exists in cd or cd/custom directory
            const cdDir = path.join(imageService.getLocalImagesDir(), 'cd');
            const possiblePaths = [
              path.join(cdDir, filename),
              path.join(cdDir, 'custom', filename)
            ];
            
            // Also check if the cover path is a direct file path
            if (coverPath.startsWith('/api/images/')) {
              const relativePath = coverPath.replace('/api/images/', '');
              possiblePaths.push(path.join(imageService.getLocalImagesDir(), relativePath));
            }
            
            for (const testPath of possiblePaths) {
              logger.debug(`Checking path: ${testPath}`);
              if (fs.existsSync(testPath)) {
                localPath = testPath;
                logger.debug(`Found local cover at: ${localPath}`);
                break;
              }
            }
            
            if (!localPath) {
              logger.warn(`Local cover file not found for album ${album.id}: ${filename}. Checked paths: ${possiblePaths.join(', ')}`);
              skipped++;
              errorDetails.push({ albumId: album.id, title: album.title, error: 'Local file not found' });
              processed++;
              continue;
            }
          }
          
          // Resize the image (whether downloaded or already local)
          if (localPath) {
            try {
              const wasResized = await imageService.resizeImage(localPath, localPath, 1000, 1000);
              
              if (wasResized) {
                resized++;
                logger.info(`Resized cover for album ${album.id}: ${album.title}`);
              } else {
                skipped++;
                logger.debug(`Skipped resize for album ${album.id}: ${album.title} (already correct size)`);
              }
            } catch (resizeError) {
              logger.error(`Failed to resize cover for album ${album.id}:`, resizeError);
              errors++;
              errorDetails.push({ albumId: album.id, title: album.title, error: `Resize failed: ${resizeError.message}` });
              processed++;
              continue;
            }
          }
          
          processed++;
          
          // Send progress update
          if (processed % 5 === 0) {
            logger.info(`Progress: ${processed}/${albumsWithCovers.length} albums processed (${downloaded} downloaded, ${resized} resized)`);
          }
          
        } catch (error) {
          logger.error(`Error processing album ${album.id}:`, error);
          errors++;
          errorDetails.push({ albumId: album.id, title: album.title, error: error.message });
          processed++;
        }
      }
      
      const result = {
        success: true,
        total: albumsWithCovers.length,
        processed,
        downloaded,
        resized,
        skipped,
        errors,
        errorDetails: errorDetails.length > 0 ? errorDetails : undefined
      };
      
      logger.info('Album cover migration completed:', result);
      res.json(result);
      
    } catch (error) {
      logger.error('Error during album cover migration:', error);
      res.status(500).json({ error: 'Failed to migrate album covers', details: error.message });
    }
  },

  // Get albums missing covers (front or back)
  getAlbumsMissingCovers: async (req, res) => {
    try {
      const { type = 'back' } = req.query;
      const db = getDatabase();
      
      const coverField = type === 'front' ? 'cover' : 'back_cover';
      const sql = `
        SELECT id, artist, title, musicbrainz_release_id, cover, back_cover
        FROM albums 
        WHERE (${coverField} IS NULL OR ${coverField} = '') 
        AND musicbrainz_release_id IS NOT NULL
        ORDER BY title
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          console.error(`Error getting albums missing ${type} covers:`, err);
          return res.status(500).json({ error: `Failed to get albums missing ${type} covers` });
        }
        
        const albums = rows.map(row => ({
          id: row.id,
          artist: JSON.parse(row.artist || '[]'),
          title: row.title,
          musicbrainzReleaseId: row.musicbrainz_release_id,
          cover: row.cover,
          backCover: row.back_cover
        }));
        
        res.json({ albums, count: albums.length });
      });
    } catch (error) {
      console.error(`Error getting albums missing ${req.query.type || 'back'} covers:`, error);
      res.status(500).json({ error: `Failed to get albums missing ${req.query.type || 'back'} covers` });
    }
  },

  // Fill covers for albums (front or back)
  fillCovers: async (req, res) => {
    try {
      const { albumIds, type = 'back' } = req.body;
      
      if (!albumIds || !Array.isArray(albumIds)) {
        return res.status(400).json({ error: 'albumIds array is required' });
      }

      const results = {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: []
      };

      for (let i = 0; i < albumIds.length; i++) {
        const albumId = albumIds[i];
        try {
          results.processed++;
          
          // Get album details
          const album = await Album.findById(albumId);
          if (!album || !album.musicbrainzReleaseId) {
            results.failed++;
            continue; // Don't add to errors array
          }

          // Get cover art from MusicBrainz
          const coverArt = await musicbrainzService.getCoverArt(album.musicbrainzReleaseId);
          
          const coverData = type === 'front' ? coverArt?.front : coverArt?.back;
          const existingCover = type === 'front' ? album.cover : album.backCover;
          
          // Skip if cover already exists
          if (existingCover && existingCover.trim() !== '') {
            results.successful++;
            console.log(`✅ ${type === 'front' ? 'Front' : 'Back'} cover already exists for album ${albumId}: ${album.title}`);
            continue;
          }
          
          if (coverData && coverData.url) {
            try {
              // Download and save the cover
              const filename = `album_${albumId}_${type}_${Date.now()}.jpg`;
              const coverPath = await imageService.downloadImageFromUrl(
                coverData.url, 
                'cd', 
                filename
              );
              
              if (coverPath) {
                // Update album with cover path
                if (type === 'front') {
                  await Album.updateFrontCover(albumId, coverPath);
                } else {
                  await Album.updateBackCover(albumId, coverPath);
                }
                results.successful++;
                console.log(`✅ ${type === 'front' ? 'Front' : 'Back'} cover added for album ${albumId}: ${album.title}`);
              } else {
                results.failed++;
              }
            } catch (downloadError) {
              results.failed++;
            }
          } else {
            results.failed++;
          }
        } catch (error) {
          results.failed++;
        }
      }

      res.json(results);
    } catch (error) {
      console.error(`Error filling ${req.body.type || 'back'} covers:`, error);
      res.status(500).json({ error: `Failed to fill ${req.body.type || 'back'} covers` });
    }
  },

  // Export albums as CSV
  exportCSV: async (req, res) => {
    try {
      const albums = await musicService.getAllAlbums();
      
      // Get selected columns from query parameter
      const selectedColumns = req.query.columns ? req.query.columns.split(',') : [
        'artist', 'title', 'release_year', 'labels', 'catalog_number', 'barcode',
        'country', 'edition_notes', 'genres', 'tags', 'rating', 'total_duration',
        'format', 'packaging', 'status', 'release_events', 'recording_quality',
        'musicbrainz_release_id', 'musicbrainz_release_group_id', 'release_group_first_release_date',
        'release_group_type', 'release_group_secondary_types', 'ownership_condition',
        'ownership_notes', 'ownership_purchased_at', 'ownership_price_chf', 'producer',
        'engineer', 'recording_location', 'language', 'apple_music_url', 'urls', 'isrc_codes', 
        'annotation', 'title_status'
      ];
      
      // Validate columns - only allow meaningful columns (excluding ID, cover, back_cover)
      const allowedColumns = [
        'artist', 'title', 'release_year', 'labels', 'catalog_number', 'barcode',
        'country', 'edition_notes', 'genres', 'tags', 'rating', 'total_duration',
        'format', 'packaging', 'status', 'release_events', 'recording_quality',
        'musicbrainz_release_id', 'musicbrainz_release_group_id', 'release_group_first_release_date',
        'release_group_type', 'release_group_secondary_types', 'ownership_condition',
        'ownership_notes', 'ownership_purchased_at', 'ownership_price_chf', 'producer',
        'engineer', 'recording_location', 'language', 'apple_music_url', 'urls', 'isrc_codes', 
        'annotation', 'title_status'
      ];
      
      const validColumns = selectedColumns.filter(col => allowedColumns.includes(col));
      
      if (validColumns.length === 0) {
        return res.status(400).json({ error: 'No valid columns selected for export' });
      }
      
      // Create CSV header
      const csvHeader = validColumns.map(col => {
        // Convert snake_case to Title Case for headers
        return col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }).join(',') + '\n';
      
      // Helper function to convert JSON arrays to comma-separated strings
      const formatArrayValue = (value) => {
        if (Array.isArray(value)) {
          return value.join(', ');
        }
        return value;
      };
      
      // Helper function to format release events (array of objects with date/country)
      const formatReleaseEvents = (events) => {
        if (Array.isArray(events) && events.length > 0) {
          return events.map(event => {
            if (typeof event === 'object') {
              const parts = [];
              if (event.date) parts.push(event.date);
              if (event.country) parts.push(`(${event.country})`);
              return parts.join(' ');
            }
            return event;
          }).join('; ');
        }
        return events;
      };
      
      // Helper function to format URLs object (excluding Apple Music since it has its own column)
      const formatUrlsValue = (urls) => {
        if (urls && typeof urls === 'object' && !Array.isArray(urls)) {
          return Object.entries(urls)
            .filter(([key]) => key !== 'appleMusic') // Exclude Apple Music URL
            .map(([key, val]) => `${key}: ${val}`)
            .join(', ');
        }
        return urls;
      };
      
      // Create CSV rows
      const csvRows = albums.map(album => {
        return validColumns.map(col => {
          let value;
          
          // Handle ownership fields
          if (col.startsWith('ownership_')) {
            const ownershipField = col.replace('ownership_', '');
            value = album.ownership?.[ownershipField === 'purchased_at' ? 'purchasedAt' : 
                                       ownershipField === 'price_chf' ? 'priceChf' : 
                                       ownershipField];
          } else if (col === 'apple_music_url') {
            // Handle Apple Music URL separately
            value = album.urls?.appleMusic || '';
          } else {
            // Convert snake_case to camelCase for album object access
            const camelCaseCol = col.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            value = album[camelCaseCol];
          }
          
          // Handle special cases - convert arrays to comma-separated strings
          if (col === 'artist' || col === 'labels' || col === 'genres' || col === 'tags' || 
              col === 'release_group_secondary_types' || 
              col === 'producer' || col === 'engineer' || col === 'isrc_codes') {
            value = formatArrayValue(value);
          }
          
          // Handle release events (array of objects)
          if (col === 'release_events') {
            value = formatReleaseEvents(value);
          }
          
          // Handle URLs object
          if (col === 'urls') {
            value = formatUrlsValue(value);
          }
          
          if (value === null || value === undefined) {
            value = '';
          }
          
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',');
      }).join('\n');
      
      const csvContent = csvHeader + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="albums.csv"');
      res.send(csvContent);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = musicController;
module.exports.coverUploadMiddleware = coverUpload.single('cover');

