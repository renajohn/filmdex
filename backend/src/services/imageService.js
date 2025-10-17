const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
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
    const dirs = ['posters', 'backdrops', 'profiles', 'posters/custom', 'cd'];
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
          const localPath = `/api/images/${type}/${filename}`;
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

  // Download image from external URL (like MusicBrainz cover art)
  downloadImageFromUrl: async (imageUrl, type, filename) => {
    if (!imageUrl) return null;
    
    try {
      const response = await axios.get(imageUrl, { responseType: 'stream' });
      
      const localPath = path.join(ImageService.getLocalImagesDir(), type, filename);
      const writer = fs.createWriteStream(localPath);
      
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          logger.debug(`Downloaded ${type} image from URL: ${filename}`);
          const localPath = `/api/images/${type}/${filename}`;
          logger.debug(`Returning local path: ${localPath}`);
          resolve(localPath);
        });
        writer.on('error', (error) => {
          console.error(`Error writing ${type} image ${filename}:`, error);
          reject(error);
        });
      });
    } catch (error) {
      console.error(`Failed to download image from URL ${imageUrl}:`, error.message);
      return null;
    }
  },

  // Save image buffer to file
  saveImage: async (imageBuffer, type, filename) => {
    try {
      const localPath = path.join(ImageService.getLocalImagesDir(), type, filename);
      
      // Ensure directory exists
      const dirPath = path.dirname(localPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      fs.writeFileSync(localPath, imageBuffer);
      
      logger.debug(`Saved ${type} image: ${filename}`);
      const localPathUrl = `/api/images/${type}/${filename}`;
      logger.debug(`Returning local path: ${localPathUrl}`);
      return localPathUrl;
    } catch (error) {
      console.error(`Error saving ${type} image ${filename}:`, error);
      throw error;
    }
  },

  getLocalImagePath: (type, filename) => {
    return path.join(ImageService.getLocalImagesDir(), type, filename);
  },

  getImageUrl: (type, filename) => {
    return `/images/${type}/${filename}`;
  },

  /**
   * Resize an image to max dimensions while maintaining aspect ratio
   * @param {string} sourcePath - Full path to source image
   * @param {string} destPath - Full path to destination (can be same as source)
   * @param {number} maxWidth - Maximum width (default: 1000)
   * @param {number} maxHeight - Maximum height (default: 1000)
   */
  resizeImage: async (sourcePath, destPath, maxWidth = 1000, maxHeight = 1000) => {
    try {
      const image = sharp(sourcePath);
      const metadata = await image.metadata();
      
      // Only resize if image is larger than max dimensions
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        logger.debug(`Resizing image from ${metadata.width}x${metadata.height} to max ${maxWidth}x${maxHeight}`);
        
        // Create a temporary file for the resize operation
        const tempPath = destPath + '.tmp';
        
        await image
          .resize(maxWidth, maxHeight, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 90 })
          .toFile(tempPath);
        
        // Replace the original file with the resized version
        fs.renameSync(tempPath, destPath);
        
        return true; // Image was resized
      } else {
        logger.debug(`Image ${metadata.width}x${metadata.height} is within limits, no resize needed`);
        return false; // Image was not resized
      }
    } catch (error) {
      logger.error(`Error resizing image ${sourcePath}:`, error);
      throw error;
    }
  },

  /**
   * Resize a CD cover image (album art)
   * @param {string} imagePath - Path to the image file
   */
  resizeCDCover: async (imagePath) => {
    const fullPath = path.join(ImageService.getLocalImagesDir(), 'cd', path.basename(imagePath));
    return await ImageService.resizeImage(fullPath, fullPath, 1000, 1000);
  },

  // Clean up unused images
  cleanupUnusedImages: async (usedImagePaths) => {
    try {
      const dirs = ['posters', 'backdrops', 'profiles', 'cd'];
      
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
