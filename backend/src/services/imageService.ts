import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import configManager from '../config';
import logger from '../logger';
import musicbrainzService from './musicbrainzService';

const ImageService = {
  BASE_URL: 'https://image.tmdb.org/t/p',

  getLocalImagesDir: (): string => {
    try {
      return configManager.getImagesPath();
    } catch (error) {
      // Fallback to default if config not loaded
      return path.join(__dirname, '../../images');
    }
  },

  init: async (): Promise<void> => {
    // Create image directories if they don't exist
    const dirs = ['posters', 'backdrops', 'profiles', 'posters/custom', 'cd'];
    for (const dir of dirs) {
      const dirPath = path.join(ImageService.getLocalImagesDir(), dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  },

  downloadImage: async (imagePath: string | null, type: string, tmdbId: number, filename: string | null = null): Promise<string | null> => {
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

      return new Promise<string | null>((resolve, reject) => {
        writer.on('finish', () => {
          logger.debug(`Downloaded ${type} image: ${filename}`);
          const localPath = `/api/images/${type}/${filename}`;
          logger.debug(`Returning local path: ${localPath}`);
          resolve(localPath);
        });
        writer.on('error', (error: Error) => {
          console.error(`Error writing ${type} image ${filename}:`, error);
          reject(error);
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to download image ${imagePath}:`, message);
      return null;
    }
  },

  downloadPoster: async (posterPath: string | null, tmdbId: number): Promise<string | null> => {
    return await ImageService.downloadImage(posterPath, 'posters', tmdbId);
  },

  downloadBackdrop: async (backdropPath: string | null, tmdbId: number): Promise<string | null> => {
    return await ImageService.downloadImage(backdropPath, 'backdrops', tmdbId);
  },

  downloadProfile: async (profilePath: string | null, tmdbId: number, castId?: number): Promise<string | null> => {
    if (!profilePath) return null;
    // Use the TMDB profile path directly as filename (remove leading slash)
    // This is simpler and ensures uniqueness since TMDB paths are already unique
    const filename = profilePath.startsWith('/') ? profilePath.substring(1) : profilePath;
    logger.debug(`Downloading profile: ${profilePath} -> ${filename}`);
    return await ImageService.downloadImage(profilePath, 'profiles', tmdbId, filename);
  },

  // Download image from external URL (like MusicBrainz cover art)
  downloadImageFromUrl: async (imageUrl: string | null, type: string, filename: string): Promise<string | null> => {
    if (!imageUrl) return null;

    try {
      console.log(`ImageService: Downloading from ${imageUrl}`);

      // Ensure directory exists
      const targetDir = path.join(ImageService.getLocalImagesDir(), type);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const filePath = path.join(targetDir, filename);

      // Check if file already exists
      if (fs.existsSync(filePath)) {
        console.log(`ImageService: File already exists: ${filename}`);
        return `/api/images/${type}/${filename}`;
      }

      // Simple download with basic timeout
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000, // 15 seconds - shorter than MusicBrainz timeout
        headers: {
          'User-Agent': musicbrainzService.userAgent,
          'Accept': 'image/*'
        }
      });

      console.log(`ImageService: Response status: ${response.status}, content-type: ${response.headers['content-type']}`);

      // Write file directly from buffer
      fs.writeFileSync(filePath, response.data as Buffer);
      console.log(`ImageService: Successfully downloaded ${type} image: ${filename}`);

      return `/api/images/${type}/${filename}`;

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ImageService: Failed to download image from URL ${imageUrl}:`, message);
      return null;
    }
  },

  // Save image buffer to file
  saveImage: async (imageBuffer: Buffer, type: string, filename: string): Promise<string> => {
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

  getLocalImagePath: (type: string, filename: string): string => {
    return path.join(ImageService.getLocalImagesDir(), type, filename);
  },

  getImageUrl: (type: string, filename: string): string => {
    return `/images/${type}/${filename}`;
  },

  /**
   * Resize an image to max dimensions while maintaining aspect ratio
   */
  resizeImage: async (sourcePath: string, destPath: string, maxWidth: number = 1200, maxHeight: number = 1200): Promise<boolean> => {
    try {
      const image = sharp(sourcePath);
      const metadata = await image.metadata();

      // Only resize if image is larger than max dimensions
      if ((metadata.width ?? 0) > maxWidth || (metadata.height ?? 0) > maxHeight) {
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
   */
  resizeCDCover: async (imagePath: string): Promise<boolean> => {
    const fullPath = path.join(ImageService.getLocalImagesDir(), 'cd', path.basename(imagePath));
    return await ImageService.resizeImage(fullPath, fullPath, 1200, 1200);
  },

  // Clean up unused images
  cleanupUnusedImages: async (usedImagePaths: string[]): Promise<void> => {
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

export default ImageService;
