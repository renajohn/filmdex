import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import configManager from '../config';
import logger from '../logger';

interface BackupResult {
  filename: string;
  path: string;
  size: number;
  sizeMB: number;
}

interface BackupListEntry {
  filename: string;
  size: number;
  sizeMB: string;
  created: Date;
  modified: Date;
}

interface RestoreResult {
  success: boolean;
  message: string;
  preRestoreBackup: string | null;
}

interface CleanupResult {
  success: boolean;
  cleanedCount: number;
}

const BackupService = {
  // Get backup directory path
  getBackupDir(): string {
    const dataPath = configManager.getDataPath();
    const backupDir = path.join(dataPath, 'backups');

    // Create backup directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      logger.info(`Created backup directory: ${backupDir}`);
    }

    return backupDir;
  },

  // Create a backup zip file
  async createBackup(): Promise<BackupResult> {
    return new Promise(async (resolve, reject) => {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' +
                        new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
        const backupDir = this.getBackupDir();
        const backupFilename = `backup_${timestamp}.zip`;
        const backupPath = path.join(backupDir, backupFilename);

        // Get paths
        const dbPath = configManager.getDatabasePath();
        const imagesPath = configManager.getImagesPath();
        const ebooksPath = configManager.getEbooksPath();

        // Check if files/directories exist
        if (!fs.existsSync(dbPath)) {
          return reject(new Error('Database file not found'));
        }

        // Create a file to stream archive data to
        const output = fs.createWriteStream(backupPath);
        const archive = archiver('zip', {
          zlib: { level: 9 } // Sets the compression level
        });

        // Listen for all archive data to be written
        output.on('close', () => {
          const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
          logger.info(`Backup created: ${backupFilename} (${sizeMB} MB)`);
          resolve({
            filename: backupFilename,
            path: backupPath,
            size: archive.pointer(),
            sizeMB: parseFloat(sizeMB)
          });
        });

        // Catch warnings (e.g. stat failures and other non-blocking errors)
        archive.on('warning', (err: NodeJS.ErrnoException) => {
          if (err.code === 'ENOENT') {
            logger.warn('Archive warning:', err);
          } else {
            reject(err);
          }
        });

        // Catch errors
        archive.on('error', (err: Error) => {
          reject(err);
        });

        // Pipe archive data to the file
        archive.pipe(output);

        // Add database file
        if (fs.existsSync(dbPath)) {
          archive.file(dbPath, { name: 'db.sqlite' });
          logger.debug('Added database to backup');
        }

        // Add images directory
        if (fs.existsSync(imagesPath)) {
          archive.directory(imagesPath, 'images');
          logger.debug('Added images directory to backup');
        }

        // Add ebooks directory
        if (fs.existsSync(ebooksPath)) {
          archive.directory(ebooksPath, 'ebooks');
          logger.debug('Added ebooks directory to backup');
        }

        // Finalize the archive
        archive.finalize();
      } catch (error) {
        logger.error('Error creating backup:', error);
        reject(error);
      }
    });
  },

  // Get list of available backups
  getBackups(): BackupListEntry[] {
    try {
      const backupDir = this.getBackupDir();

      if (!fs.existsSync(backupDir)) {
        return [];
      }

      const files = fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.zip'))
        .map(file => {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            size: stats.size,
            sizeMB: (stats.size / 1024 / 1024).toFixed(2),
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.created.getTime() - a.created.getTime()); // Sort by creation date, newest first

      return files;
    } catch (error) {
      logger.error('Error listing backups:', error);
      throw error;
    }
  },

  // Get backup file path
  getBackupPath(filename: string): string {
    const backupDir = this.getBackupDir();
    const backupPath = path.join(backupDir, filename);

    // Security: ensure the file is in the backup directory
    if (!backupPath.startsWith(backupDir)) {
      throw new Error('Invalid backup filename');
    }

    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    return backupPath;
  },

  // Restore from backup
  async restoreBackup(backupPath: string): Promise<RestoreResult> {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file not found');
      }

      logger.info(`Starting restore from: ${path.basename(backupPath)}`);

      // Get paths
      const dataPath = configManager.getDataPath();
      const dbPath = configManager.getDatabasePath();
      const imagesPath = configManager.getImagesPath();
      const ebooksPath = configManager.getEbooksPath();

      // Create a backup of current state BEFORE restoring (wait for it to complete)
      const currentBackupPath = path.join(this.getBackupDir(), `pre_restore_${Date.now()}.zip`);
      logger.info('Creating pre-restore backup of current state...');

      let preRestoreBackupFilename: string | null = null;
      try {
        // Create backup and wait for it to complete
        const backupResult = await this.createBackup();
        // Rename the backup to pre-restore name
        fs.renameSync(backupResult.path, currentBackupPath);
        preRestoreBackupFilename = path.basename(currentBackupPath);
        logger.info(`Pre-restore backup created: ${preRestoreBackupFilename}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('Failed to create pre-restore backup:', message);
        // Continue with restore even if pre-restore backup fails
      }

      // Now read the zip file to restore
      const zip = new AdmZip(backupPath);
      const zipEntries = zip.getEntries();

      // Extract database
      const dbEntry = zipEntries.find(entry => entry.entryName === 'db.sqlite');
      if (dbEntry) {
        // Extract database (no need for individual backup since we have pre-restore backup)
        zip.extractEntryTo(dbEntry, dataPath, false, true);
        logger.info('Database restored');
      } else {
        logger.warn('No database found in backup');
      }

      // Extract images directory
      const imagesEntries = zipEntries.filter(entry => entry.entryName.startsWith('images/'));
      if (imagesEntries.length > 0) {
        // Remove existing images directory if it exists (we have pre-restore backup)
        if (fs.existsSync(imagesPath)) {
          fs.rmSync(imagesPath, { recursive: true, force: true });
        }

        // Extract images directory
        zipEntries
          .filter(entry => entry.entryName.startsWith('images/'))
          .forEach(entry => {
            const entryPath = entry.entryName.replace('images/', '');
            if (entry.isDirectory) {
              const dirPath = path.join(imagesPath, entryPath);
              if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
              }
            } else {
              const filePath = path.join(imagesPath, entryPath);
              const dirPath = path.dirname(filePath);
              if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
              }
              fs.writeFileSync(filePath, entry.getData());
            }
          });
        logger.info('Images directory restored');
      } else {
        logger.warn('No images found in backup');
      }

      // Extract ebooks directory
      const ebooksEntries = zipEntries.filter(entry => entry.entryName.startsWith('ebooks/'));
      if (ebooksEntries.length > 0) {
        // Remove existing ebooks directory if it exists (we have pre-restore backup)
        if (fs.existsSync(ebooksPath)) {
          fs.rmSync(ebooksPath, { recursive: true, force: true });
        }

        // Extract ebooks directory
        zipEntries
          .filter(entry => entry.entryName.startsWith('ebooks/'))
          .forEach(entry => {
            const entryPath = entry.entryName.replace('ebooks/', '');
            if (entry.isDirectory) {
              const dirPath = path.join(ebooksPath, entryPath);
              if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
              }
            } else {
              const filePath = path.join(ebooksPath, entryPath);
              const dirPath = path.dirname(filePath);
              if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
              }
              fs.writeFileSync(filePath, entry.getData());
            }
          });
        logger.info('Ebooks directory restored');
      } else {
        logger.warn('No ebooks found in backup');
      }

      logger.info('Restore completed successfully');

      // Clean up temporary backup files created during restore
      // (keep the pre_restore zip file as it's a full backup for safety)
      try {
        this.cleanupRestoreBackups();
      } catch (cleanupError) {
        const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        logger.warn('Failed to cleanup restore backups:', message);
        // Don't fail the restore if cleanup fails
      }

      return {
        success: true,
        message: 'Backup restored successfully',
        preRestoreBackup: preRestoreBackupFilename
      };
    } catch (error) {
      logger.error('Error restoring backup:', error);
      throw error;
    }
  },

  // Delete a backup file
  deleteBackup(filename: string): { success: boolean; message: string } {
    try {
      const backupPath = this.getBackupPath(filename);
      fs.unlinkSync(backupPath);
      logger.info(`Backup deleted: ${filename}`);
      return { success: true, message: 'Backup deleted successfully' };
    } catch (error) {
      logger.error('Error deleting backup:', error);
      throw error;
    }
  },

  // Clean up temporary backup files created during restore
  cleanupRestoreBackups(): CleanupResult {
    try {
      const dataPath = configManager.getDataPath();
      const dbPath = configManager.getDatabasePath();
      const imagesPath = configManager.getImagesPath();
      const ebooksPath = configManager.getEbooksPath();

      let cleanedCount = 0;

      // Clean up database backup files (db.sqlite.backup.*)
      const dbDir = path.dirname(dbPath);
      if (fs.existsSync(dbDir)) {
        const files = fs.readdirSync(dbDir);
        files.forEach(file => {
          if (file.startsWith('db.sqlite.backup.')) {
            const filePath = path.join(dbDir, file);
            try {
              fs.unlinkSync(filePath);
              logger.info(`Cleaned up database backup: ${file}`);
              cleanedCount++;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              logger.warn(`Failed to delete ${file}:`, message);
            }
          }
        });
      }

      // Clean up images backup directories (images.backup.*)
      const imagesParentDir = path.dirname(imagesPath);
      if (fs.existsSync(imagesParentDir)) {
        const items = fs.readdirSync(imagesParentDir);
        items.forEach(item => {
          if (item.startsWith('images.backup.')) {
            const itemPath = path.join(imagesParentDir, item);
            try {
              if (fs.statSync(itemPath).isDirectory()) {
                fs.rmSync(itemPath, { recursive: true, force: true });
                logger.info(`Cleaned up images backup directory: ${item}`);
                cleanedCount++;
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              logger.warn(`Failed to delete ${item}:`, message);
            }
          }
        });
      }

      // Clean up ebooks backup directories (ebooks.backup.*)
      const ebooksParentDir = path.dirname(ebooksPath);
      if (fs.existsSync(ebooksParentDir)) {
        const items = fs.readdirSync(ebooksParentDir);
        items.forEach(item => {
          if (item.startsWith('ebooks.backup.')) {
            const itemPath = path.join(ebooksParentDir, item);
            try {
              if (fs.statSync(itemPath).isDirectory()) {
                fs.rmSync(itemPath, { recursive: true, force: true });
                logger.info(`Cleaned up ebooks backup directory: ${item}`);
                cleanedCount++;
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              logger.warn(`Failed to delete ${item}:`, message);
            }
          }
        });
      }

      logger.info(`Cleanup completed: ${cleanedCount} temporary backup files/directories removed`);
      return { success: true, cleanedCount };
    } catch (error) {
      logger.error('Error cleaning up restore backups:', error);
      throw error;
    }
  }
};

export default BackupService;
