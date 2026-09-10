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
  /**
   * Delete stored images that no record references any more.
   *
   * The caller must pass EVERY path still in use across the directories walked
   * below -- this deletes whatever is not listed. Paths are compared in the shape
   * the database stores them ("/api/images/cd/x.jpg"); the previous version built
   * "/images/cd/x.jpg" instead, so nothing ever matched and it would have removed
   * the whole collection had it not crashed on the first subdirectory it met.
   */
  cleanupUnusedImages: async (usedImagePaths: string[]): Promise<number> => {
    if (!Array.isArray(usedImagePaths) || usedImagePaths.length === 0) {
      throw new Error(
        'cleanupUnusedImages refuses an empty reference list: it would delete every stored image'
      );
    }

    // "/api/images/cd/x.jpg" and "/images/cd/x.jpg" both reduce to "cd/x.jpg"
    const toKey = (value: string): string =>
      value
        .replace(/^\/?api\//, '')
        .replace(/^\/?images\//, '')
        .replace(/^\//, '');

    const used = new Set(usedImagePaths.filter(Boolean).map(toKey));
    const imagesDir = ImageService.getLocalImagesDir();
    const dirs = ['posters', 'backdrops', 'profiles', 'cd'];
    let deleted = 0;

    const walk = (absDir: string): void => {
      for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        const absPath = path.join(absDir, entry.name);

        if (entry.isDirectory()) {
          walk(absPath);
          continue;
        }

        const key = path.relative(imagesDir, absPath).split(path.sep).join('/');
        if (!used.has(key)) {
          fs.unlinkSync(absPath);
          deleted += 1;
          logger.debug(`Deleted unused image: ${key}`);
        }
      }
    };

    for (const dir of dirs) {
      const dirPath = path.join(imagesDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      walk(dirPath);
    }

    return deleted;
  }
};

export default ImageService;
