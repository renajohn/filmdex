
import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import musicService from '../services/musicService';
import imageService from '../services/imageService';
import musicbrainzService from '../services/musicbrainzService';
import Album from '../models/album';
import { getDatabase } from '../database';
import musicCollectionService from '../services/musicCollectionService';
import smartPlaylistService from '../services/smartPlaylistService';
import logger from '../logger';
import type { AlbumFormatted } from '../types';

// Configure multer for cover uploads
const storage = multer.diskStorage({
  destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const customCoverDir = path.join(imageService.getLocalImagesDir(), 'cd', 'custom');
    // Ensure directory exists
    if (!fs.existsSync(customCoverDir)) {
      fs.mkdirSync(customCoverDir, { recursive: true });
    }
    cb(null, customCoverDir);
  },
  filename: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const cdId = (req as Request).params.id;
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
  fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept images only
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  }
});

const musicController = {
  // Get all albums
  getAllAlbums: async (req: Request, res: Response): Promise<void> => {
    try {
      const albums = await musicService.getAllAlbums();
      res.json(albums);
    } catch (error) {
      console.error('Error getting all albums:', error);
      res.status(500).json({ error: 'Failed to get albums' });
    }
  },

  // Get albums by status (owned or wish)
  getAlbumsByStatus: async (req: Request, res: Response): Promise<void> => {
    try {
      const status = req.params.status as string;
      if (!['owned', 'wish'].includes(status)) {
        res.status(400).json({ error: 'Status must be "owned" or "wish"' });
        return;
      }

      const albums = await musicService.getAlbumsByStatus(status);
      res.json(albums);
    } catch (error) {
      console.error('Error getting albums by status:', error);
      res.status(500).json({ error: 'Failed to get albums by status' });
    }
  },

  // Update album status
  updateAlbumStatus: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { status } = req.body;

      if (!['owned', 'wish'].includes(status)) {
        res.status(400).json({ error: 'Status must be "owned" or "wish"' });
        return;
      }

      const result = await musicService.updateAlbumStatus(id, status);
      res.json(result);
    } catch (error) {
      console.error('Error updating album status:', error);
      res.status(500).json({ error: 'Failed to update album status' });
    }
  },

  // Get album by ID
  getAlbumById: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const album = await musicService.getAlbumById(id);
      res.json(album);
    } catch (error) {
      console.error('Error getting album by ID:', error);
      if ((error as Error).message === 'Album not found') {
        res.status(404).json({ error: 'Album not found' });
      } else {
        res.status(500).json({ error: 'Failed to get album' });
      }
    }
  },

  // Add new album
  addAlbum: async (req: Request, res: Response): Promise<void> => {
    try {
      const albumData = req.body;
      console.log('=== ADD ALBUM REQUEST ===');
      console.log('Has discs:', !!albumData.discs);
      console.log('Discs length:', albumData.discs?.length);
      if (albumData.discs && albumData.discs.length > 0) {
        albumData.discs.forEach((disc: Record<string, unknown>, idx: number) => {
          console.log(`  Disc ${idx + 1}: ${(disc.tracks as Array<unknown>)?.length || 0} tracks`);
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
  updateAlbum: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const albumData = req.body;
      const album = await musicService.updateAlbum(id, albumData);
      res.json(album);
    } catch (error) {
      console.error('Error updating album:', error);
      res.status(500).json({ error: 'Failed to update album' });
    }
  },

  // Delete album
  deleteAlbum: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
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
  searchAlbums: async (req: Request, res: Response): Promise<void> => {
    try {
      const { q } = req.query;
      if (!q) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const albums = await musicService.searchAlbums(q as string);
      res.json(albums);
    } catch (error) {
      console.error('Error searching albums:', error);
      res.status(500).json({ error: 'Failed to search albums' });
    }
  },

  // Search MusicBrainz
  searchMusicBrainz: async (req: Request, res: Response): Promise<void> => {
    try {
      const { q } = req.query;
      if (!q) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const releases = await musicService.searchMusicBrainz(q as string);
      res.json(releases);
    } catch (error) {
      console.error('Error searching MusicBrainz:', error);
      res.status(500).json({ error: 'Failed to search MusicBrainz' });
    }
  },

  // Get cover art metadata for a specific MusicBrainz release (front/back URLs + thumbnails)
  getCoverArt: async (req: Request, res: Response): Promise<void> => {
    try {
      const releaseId = req.params.releaseId as string;
      if (!releaseId) {
        res.status(400).json({ error: 'releaseId is required' });
        return;
      }
      const coverArt = await musicbrainzService.getCoverArt(releaseId);
      res.json(coverArt || {});
    } catch (error) {
      console.error('Error getting cover art:', error);
      res.status(500).json({ error: 'Failed to get cover art' });
    }
  },

  // Get MusicBrainz release details
  getMusicBrainzReleaseDetails: async (req: Request, res: Response): Promise<void> => {
    try {
      const releaseId = req.params.releaseId as string;
      const release = await musicService.getMusicBrainzReleaseDetails(releaseId);
      res.json(release);
    } catch (error) {
      console.error('Error getting MusicBrainz release details:', error);
      res.status(500).json({ error: 'Failed to get release details' });
    }
  },

  // Add album from MusicBrainz
  addAlbumFromMusicBrainz: async (req: Request, res: Response): Promise<void> => {
    try {
      const releaseId = req.params.releaseId as string;
      const additionalData = req.body || {};

      const album = await musicService.addAlbumFromMusicBrainz(releaseId, additionalData);
      res.status(201).json(album);
    } catch (error) {
      console.error('Error adding album from MusicBrainz:', error);
      if ((error as Error).message === 'Album already exists in collection') {
        res.status(409).json({ error: 'Album already exists in collection' });
      } else {
        res.status(500).json({ error: 'Failed to add album from MusicBrainz' });
      }
    }
  },

  // Add album by barcode
  addAlbumByBarcode: async (req: Request, res: Response): Promise<void> => {
    try {
      const barcode = req.params.barcode as string;
      const additionalData = req.body || {};

      const album = await musicService.addAlbumByBarcode(barcode, additionalData);
      res.status(201).json(album);
    } catch (error) {
      console.error('Error adding album by barcode:', error);
      if ((error as Error).message === 'No release found for this barcode') {
        res.status(404).json({ error: 'No release found for this barcode' });
      } else {
        res.status(500).json({ error: 'Failed to add album by barcode' });
      }
    }
  },

  searchByCatalogNumber: async (req: Request, res: Response): Promise<void> => {
    try {
      const { catalogNumber } = req.query;

      if (!catalogNumber) {
        res.status(400).json({ error: 'Catalog number is required' });
        return;
      }

      const releases = await musicService.searchByCatalogNumber(catalogNumber as string);
      res.json(releases);
    } catch (error) {
      console.error('Error searching by catalog number:', error);
      res.status(500).json({ error: 'Failed to search by catalog number' });
    }
  },

  searchByBarcode: async (req: Request, res: Response): Promise<void> => {
    try {
      const { barcode } = req.query;

      if (!barcode) {
        res.status(400).json({ error: 'Barcode is required' });
        return;
      }

      const releases = await musicService.searchByBarcode(barcode as string);
      res.json(releases);
    } catch (error) {
      console.error('Error searching by barcode:', error);
      res.status(500).json({ error: 'Failed to search by barcode' });
    }
  },

  // Get or resolve Apple Music URL for an album
  getAppleMusicUrl: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const result = await musicService.getAppleMusicUrl(id);
      res.json(result);
    } catch (error) {
      console.error('Error getting Apple Music URL:', error);
      res.status(500).json({ error: 'Failed to resolve Apple Music URL' });
    }
  },

  // Get autocomplete suggestions
  getAutocompleteSuggestions: async (req: Request, res: Response): Promise<void> => {
    try {
      const { field, value } = req.query;

      if (!field) {
        res.status(400).json({ error: 'Field parameter is required' });
        return;
      }

      const suggestions = await musicService.getAutocompleteSuggestions(field as string, (value as string) || '');
      res.json(suggestions);
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      res.status(500).json({ error: 'Failed to get autocomplete suggestions' });
    }
  },

  // Upload custom cover for a CD
  uploadCustomCover: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const file = req.file as Express.Multer.File | undefined;

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

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
        logger.warn('Failed to resize cover image:', (error as Error).message);
      }

      // Construct the cover path using API endpoint (works with Home Assistant ingress)
      const coverPath = `/api/images/cd/custom/${file.filename}`;

      // Update only the cover field without affecting other data
      const db = require('../database').getDatabase();
      await new Promise<void>((resolve, reject) => {
        const sql = 'UPDATE albums SET cover = ? WHERE id = ?';
        db.run(sql, [coverPath, id], function(this: { changes: number }, err: Error | null) {
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

  uploadCustomBackCover: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const file = req.file as Express.Multer.File | undefined;

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

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
        logger.warn('Failed to resize back cover image:', (error as Error).message);
      }

      // Construct the back cover path using API endpoint (works with Home Assistant ingress)
      const backCoverPath = `/api/images/cd/custom/${file.filename}`;

      // Update only the back_cover field without affecting other data
      const db = require('../database').getDatabase();
      await new Promise<void>((resolve, reject) => {
        const sql = 'UPDATE albums SET back_cover = ? WHERE id = ?';
        db.run(sql, [backCoverPath, id], function(this: { changes: number }, err: Error | null) {
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
  resizeAllAlbumCovers: async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info('Starting album cover migration (download + resize)...');

      const db = require('../database').getDatabase();

      // Get all albums with covers (including wish list albums for migration)
      const allAlbums = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const sql = 'SELECT * FROM albums WHERE cover IS NOT NULL AND cover != "" ORDER BY title';
        db.all(sql, [], (err: Error | null, rows: Array<Record<string, unknown>>) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map((row) => Album.formatRow(row as any) as unknown as Record<string, unknown>));
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
      const errorDetails: Array<{ albumId: unknown; title: unknown; error: string }> = [];

      for (const album of albumsWithCovers) {
        try {
          const coverPath = album.cover as string;
          logger.debug(`Processing album ${album.id} (${album.title}): ${coverPath}`);

          let localPath: string | null = null;
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
                await new Promise<void>((resolve, reject) => {
                  const sql = 'UPDATE albums SET cover = ? WHERE id = ?';
                  db.run(sql, [urlPath, album.id], function(this: { changes: number }, err: Error | null) {
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
              errorDetails.push({ albumId: album.id, title: album.title, error: `Download failed: ${(downloadError as Error).message}` });
              processed++;
              continue;
            }
          } else {
            // Cover is already local, find the file
            const filename = coverPath.split('/').pop()!;

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
              errorDetails.push({ albumId: album.id, title: album.title, error: `Resize failed: ${(resizeError as Error).message}` });
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
          errorDetails.push({ albumId: album.id, title: album.title, error: (error as Error).message });
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
      res.status(500).json({ error: 'Failed to migrate album covers', details: (error as Error).message });
    }
  },

  // Get albums missing covers (front or back)
  getAlbumsMissingCovers: async (req: Request, res: Response): Promise<void> => {
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

      db.all(sql, [], (err: Error | null, rows: Array<Record<string, unknown>>) => {
        if (err) {
          console.error(`Error getting albums missing ${type} covers:`, err);
          res.status(500).json({ error: `Failed to get albums missing ${type} covers` });
          return;
        }

        const albums = rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          artist: JSON.parse((row.artist as string) || '[]'),
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
  fillCovers: async (req: Request, res: Response): Promise<void> => {
    try {
      const { albumIds, type = 'back' } = req.body;

      if (!albumIds || !Array.isArray(albumIds)) {
        res.status(400).json({ error: 'albumIds array is required' });
        return;
      }

      const results = {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: [] as string[]
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
            console.log(`${type === 'front' ? 'Front' : 'Back'} cover already exists for album ${albumId}: ${album.title}`);
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
                console.log(`${type === 'front' ? 'Front' : 'Back'} cover added for album ${albumId}: ${album.title}`);
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
  exportCSV: async (req: Request, res: Response): Promise<void> => {
    try {
      const albums = await musicService.getAllAlbums();

      // Get selected columns from query parameter
      const selectedColumns = req.query.columns ? (req.query.columns as string).split(',') : [
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

      const validColumns = selectedColumns.filter((col: string) => allowedColumns.includes(col));

      if (validColumns.length === 0) {
        res.status(400).json({ error: 'No valid columns selected for export' });
        return;
      }

      // Create CSV header
      const csvHeader = validColumns.map((col: string) => {
        // Convert snake_case to Title Case for headers
        return col.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      }).join(',') + '\n';

      // Helper function to convert JSON arrays to comma-separated strings
      const formatArrayValue = (value: unknown): unknown => {
        if (Array.isArray(value)) {
          return value.join(', ');
        }
        return value;
      };

      // Helper function to format release events (array of objects with date/country)
      const formatReleaseEvents = (events: unknown): unknown => {
        if (Array.isArray(events) && events.length > 0) {
          return events.map((event: unknown) => {
            if (typeof event === 'object' && event !== null) {
              const parts: string[] = [];
              const eventObj = event as Record<string, unknown>;
              if (eventObj.date) parts.push(eventObj.date as string);
              if (eventObj.country) parts.push(`(${eventObj.country})`);
              return parts.join(' ');
            }
            return event;
          }).join('; ');
        }
        return events;
      };

      // Helper function to format URLs object (excluding Apple Music since it has its own column)
      const formatUrlsValue = (urls: unknown): unknown => {
        if (urls && typeof urls === 'object' && !Array.isArray(urls)) {
          return Object.entries(urls as Record<string, unknown>)
            .filter(([key]) => key !== 'appleMusic') // Exclude Apple Music URL
            .map(([key, val]) => `${key}: ${val}`)
            .join(', ');
        }
        return urls;
      };

      // Create CSV rows
      const csvRows = albums.map((album: AlbumFormatted) => {
        return validColumns.map((col: string) => {
          let value: unknown;

          // Handle ownership fields
          if (col.startsWith('ownership_')) {
            const ownershipField = col.replace('ownership_', '');
            const ownership = album.ownership as Record<string, unknown> | undefined;
            value = ownership?.[ownershipField === 'purchased_at' ? 'purchasedAt' :
                                       ownershipField === 'price_chf' ? 'priceChf' :
                                       ownershipField];
          } else if (col === 'apple_music_url') {
            // Handle Apple Music URL separately
            const urls = album.urls as Record<string, unknown> | undefined;
            value = urls?.appleMusic || '';
          } else {
            // Convert snake_case to camelCase for album object access
            const camelCaseCol = col.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
            value = (album as unknown as Record<string, unknown>)[camelCaseCol];
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
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Toggle Listen Next for an album
  toggleListenNext: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const result = await Album.toggleListenNext(id);
      res.json(result);
    } catch (error) {
      logger.error('Error toggling listen_next:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get Listen Next albums
  getListenNextAlbums: async (req: Request, res: Response): Promise<void> => {
    try {
      const albums = await musicCollectionService.getListenNextAlbums();
      res.json(albums);
    } catch (error) {
      logger.error('Error getting Listen Next albums:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Smart fill Listen Next with suggested albums
  smartFillListenNext: async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await smartPlaylistService.smartFillListenNext();

      // Get the updated Listen Next albums to return
      const albums = await musicCollectionService.getListenNextAlbums();

      res.json({
        success: true,
        added: result.added.length,
        message: result.message,
        albums: albums
      });
    } catch (error) {
      logger.error('Error in smart fill Listen Next:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Get smart playlist statistics
  getSmartPlaylistStats: async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await smartPlaylistService.getStats();
      res.json(stats);
    } catch (error) {
      logger.error('Error getting smart playlist stats:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  // Shuffle a specific album in Listen Next (replace with new suggestion)
  shuffleListenNextAlbum: async (req: Request, res: Response): Promise<void> => {
    try {
      const albumId = req.params.albumId as string;
      const result = await smartPlaylistService.shuffleAlbum(parseInt(albumId, 10));

      // Get the updated Listen Next albums to return
      const albums = await musicCollectionService.getListenNextAlbums();

      res.json({
        ...result,
        albums: albums
      });
    } catch (error) {
      logger.error('Error shuffling Listen Next album:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  },

  coverUploadMiddleware: coverUpload.single('cover')
};

export default musicController;
