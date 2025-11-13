const multer = require('multer');
const path = require('path');
const fs = require('fs');
const backupService = require('../services/backupService');
const logger = require('../logger');
const configManager = require('../config');

// Configure multer for backup upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const backupDir = backupService.getBackupDir();
    cb(null, backupDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename but add timestamp to avoid conflicts
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `uploaded_${timestamp}_${basename}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB max for backup files
  },
  fileFilter: (req, file, cb) => {
    // Accept only zip files
    if (file.mimetype === 'application/zip' || 
        file.mimetype === 'application/x-zip-compressed' ||
        path.extname(file.originalname).toLowerCase() === '.zip') {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'), false);
    }
  }
});

const backupController = {
  // Create a new backup
  async createBackup(req, res) {
    try {
      logger.info('Creating backup...');
      const result = await backupService.createBackup();
      res.json({
        success: true,
        message: 'Backup created successfully',
        backup: result
      });
    } catch (error) {
      logger.error('Error creating backup:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create backup'
      });
    }
  },

  // List all backups
  async listBackups(req, res) {
    try {
      const backups = backupService.getBackups();
      res.json({
        success: true,
        backups: backups
      });
    } catch (error) {
      logger.error('Error listing backups:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to list backups'
      });
    }
  },

  // Download a backup file
  async downloadBackup(req, res) {
    try {
      const { filename } = req.params;
      
      // Security: validate filename
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid filename'
        });
      }

      const backupPath = backupService.getBackupPath(filename);
      
      // Check if file exists
      if (!fs.existsSync(backupPath)) {
        return res.status(404).json({
          success: false,
          error: 'Backup file not found'
        });
      }

      // Get absolute path
      const absolutePath = path.resolve(backupPath);
      
      // Get file stats to set Content-Length header
      const stats = fs.statSync(absolutePath);
      const fileSize = stats.size;
      
      // Set headers for file download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Length', fileSize);
      
      // Set headers to prevent caching and ensure proper download
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Stream the file
      const fileStream = fs.createReadStream(absolutePath);
      
      // Handle stream errors
      fileStream.on('error', (error) => {
        logger.error('Error streaming backup file:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to stream backup file'
          });
        } else {
          // If headers already sent, just end the response
          res.end();
        }
      });
      
      // Handle client disconnect
      req.on('close', () => {
        if (!fileStream.destroyed) {
          fileStream.destroy();
          logger.info('Client disconnected during backup download');
        }
      });
      
      // Pipe the stream to response
      fileStream.pipe(res);
    } catch (error) {
      logger.error('Error downloading backup:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to download backup'
        });
      }
    }
  },

  // Restore from a backup file
  async restoreBackup(req, res) {
    try {
      const { filename } = req.body;
      
      if (!filename) {
        return res.status(400).json({
          success: false,
          error: 'Backup filename is required'
        });
      }

      // Security: validate filename
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid filename'
        });
      }

      const backupPath = backupService.getBackupPath(filename);
      logger.info(`Restoring from backup: ${filename}`);
      
      const result = await backupService.restoreBackup(backupPath);
      
      res.json({
        success: true,
        message: 'Backup restored successfully',
        ...result
      });
    } catch (error) {
      logger.error('Error restoring backup:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to restore backup'
      });
    }
  },

  // Upload and restore from a backup file
  async uploadAndRestoreBackup(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No backup file uploaded'
        });
      }

      const backupPath = req.file.path;
      logger.info(`Restoring from uploaded backup: ${req.file.filename}`);
      
      const result = await backupService.restoreBackup(backupPath);
      
      // Optionally delete the uploaded file after restore
      // fs.unlinkSync(backupPath);
      
      res.json({
        success: true,
        message: 'Backup uploaded and restored successfully',
        ...result
      });
    } catch (error) {
      logger.error('Error uploading and restoring backup:', error);
      
      // Clean up uploaded file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to upload and restore backup'
      });
    }
  },

  // Delete a backup file
  async deleteBackup(req, res) {
    try {
      const { filename } = req.params;
      
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid filename'
        });
      }

      const result = backupService.deleteBackup(filename);
      res.json(result);
    } catch (error) {
      logger.error('Error deleting backup:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete backup'
      });
    }
  },

  // Clean up temporary restore backup files
  async cleanupRestoreBackups(req, res) {
    try {
      const result = backupService.cleanupRestoreBackups();
      res.json({
        success: true,
        message: `Cleaned up ${result.cleanedCount} temporary backup files/directories`,
        cleanedCount: result.cleanedCount
      });
    } catch (error) {
      logger.error('Error cleaning up restore backups:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to cleanup restore backups'
      });
    }
  }
};

// Export multer middleware for upload
backupController.uploadMiddleware = upload.single('backup');

module.exports = backupController;

