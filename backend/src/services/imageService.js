const fs = require('fs');
const path = require('path');
const axios = require('axios');
const configManager = require('../config');
const logger = require('../logger');

const ImageService = {
  BASE_URL: 'https://image.tmdb.org/t/p',
  
  getLocalImagesDir: () => {
    try {
      return configManager.getImagesPath();
    } catch (error) {
      // Fallback to default if config not loaded
      return path.join(__dirname, '../../images');
    }
  },
  
  init: async () => {
    // Create image directories if they don't exist
    const dirs = ['posters', 'backdrops', 'profiles'];
    for (const dir of dirs) {
      const dirPath = path.join(ImageService.getLocalImagesDir(), dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  },

  downloadImage: async (imagePath, type, tmdbId, filename = null) => {
    if (!imagePath) return null;
    
    try {
      const imageUrl = `${ImageService.BASE_URL}/original${imagePath}`;
      const response = await axios.get(imageUrl, { responseType: 'stream' });
      
      // Generate filename if not provided
      if (!filename) {
        const extension = path.extname(imagePath) || '.jpg';
        filename = `${tmdbId}_${Date.now()}${extension}`;
      }
      
      const localPath = path.join(ImageService.getLocalImagesDir(), type, filename);
      const writer = fs.createWriteStream(localPath);
      
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          logger.debug(`Downloaded ${type} image: ${filename}`);
          const localPath = `/images/${type}/${filename}`;
          logger.debug(`Returning local path: ${localPath}`);
          resolve(localPath);
        });
        writer.on('error', (error) => {
          console.error(`Error writing ${type} image ${filename}:`, error);
          reject(error);
        });
      });
    } catch (error) {
      console.error(`Failed to download image ${imagePath}:`, error.message);
      return null;
    }
  },

  downloadPoster: async (posterPath, tmdbId) => {
    return await ImageService.downloadImage(posterPath, 'posters', tmdbId);
  },

  downloadBackdrop: async (backdropPath, tmdbId) => {
    return await ImageService.downloadImage(backdropPath, 'backdrops', tmdbId);
  },

  downloadProfile: async (profilePath, tmdbId, castId) => {
    if (!profilePath) return null;
    // Use the TMDB profile path directly as filename (remove leading slash)
    // This is simpler and ensures uniqueness since TMDB paths are already unique
    const filename = profilePath.startsWith('/') ? profilePath.substring(1) : profilePath;
    logger.debug(`Downloading profile: ${profilePath} -> ${filename}`);
    return await ImageService.downloadImage(profilePath, 'profiles', tmdbId, filename);
  },

  getLocalImagePath: (type, filename) => {
    return path.join(ImageService.getLocalImagesDir(), type, filename);
  },

  getImageUrl: (type, filename) => {
    return `/images/${type}/${filename}`;
  },

  // Clean up unused images
  cleanupUnusedImages: async (usedImagePaths) => {
    try {
      const dirs = ['posters', 'backdrops', 'profiles'];
      
      for (const dir of dirs) {
        const dirPath = path.join(ImageService.getLocalImagesDir(), dir);
        if (!fs.existsSync(dirPath)) continue;
        
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const relativePath = `/images/${dir}/${file}`;
          
          if (!usedImagePaths.includes(relativePath)) {
            fs.unlinkSync(filePath);
            logger.debug(`Deleted unused image: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up images:', error);
    }
  }
};

module.exports = ImageService;
