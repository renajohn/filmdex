const multer = require('multer');
const path = require('path');
const fs = require('fs');
const musicService = require('../services/musicService');
const imageService = require('../services/imageService');
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
  // Initialize music tables
  initialize: async (req, res) => {
    try {
      await musicService.initializeTables();
      res.json({ message: 'Music tables initialized successfully' });
    } catch (error) {
      console.error('Error initializing music tables:', error);
      res.status(500).json({ error: 'Failed to initialize music tables' });
    }
  },

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

  // Search release groups
  searchReleaseGroups: async (req, res) => {
    try {
      const { query, limit = 10 } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      const releaseGroups = await musicBrainzService.searchReleaseGroup(query, parseInt(limit));
      const formattedReleaseGroups = releaseGroups.map(musicBrainzService.formatReleaseGroupData);
      
      res.json(formattedReleaseGroups);
    } catch (error) {
      console.error('Error searching release groups:', error);
      res.status(500).json({ error: 'Failed to search release groups' });
    }
  },

  // Get releases from a release group
  getReleaseGroupReleases: async (req, res) => {
    try {
      const { releaseGroupId } = req.params;
      
      const releases = await musicBrainzService.getReleaseGroupReleases(releaseGroupId);
      const formattedReleases = releases.map(musicBrainzService.formatReleaseData);
      
      res.json(formattedReleases);
    } catch (error) {
      console.error('Error getting releases from release group:', error);
      res.status(500).json({ error: 'Failed to get releases from release group' });
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

  // Migrate existing album covers: download external URLs and resize all to 1000x1000
  resizeAllAlbumCovers: async (req, res) => {
    try {
      logger.info('Starting album cover migration (download + resize)...');
      
      const Album = require('../models/album');
      const path = require('path');
      const fs = require('fs');
      const db = require('../database').getDatabase();
      
      // Get all albums with covers
      const albums = await Album.findAll();
      const albumsWithCovers = albums.filter(album => album.cover);
      
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
  }
};

module.exports = musicController;
module.exports.coverUploadMiddleware = coverUpload.single('cover');

