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

      // Get image dimensions (try to use sharp if available, otherwise use defaults)
      let width = 500;
      let height = 500;
      
      try {
        // Try to load sharp dynamically
        const sharp = require('sharp');
        const metadata = await sharp(file.path).metadata();
        width = metadata.width;
        height = metadata.height;
      } catch (error) {
        // Sharp not available or error reading metadata - use defaults
        logger.debug('Using default cover dimensions (sharp not available or error)');
      }

      // Construct the cover path (relative to images directory)
      const coverPath = `/images/cd/custom/${file.filename}`;

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
  }
};

module.exports = musicController;
module.exports.coverUploadMiddleware = coverUpload.single('cover');

