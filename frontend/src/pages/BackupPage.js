import React, { useState, useEffect } from 'react';
import backupService from '../services/backupService';
import { BsDownload, BsTrash, BsArrowClockwise, BsPlus, BsUpload, BsCheckCircle, BsXCircle, BsClock } from 'react-icons/bs';
import './BackupPage.css';

const BackupPage = () => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      setLoading(true);
      setError(null);
      const backupList = await backupService.listBackups();
      setBackups(backupList);
    } catch (err) {
      setError(err.message || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

      const handleCreateBackup = async () => {
    try {
      setCreating(true);
      setError(null);
      setSuccess(null);
      await backupService.createBackup();
      setSuccess('Backup created successfully!');
      await loadBackups();
    } catch (err) {
      setError(err.message || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadBackup = async (filename) => {
    try {
      setError(null);
      await backupService.downloadBackup(filename);
      setSuccess(`Download of ${filename} started`);
    } catch (err) {
      setError(err.message || 'Failed to download backup');
    }
  };

  const handleRestoreBackup = async (filename) => {
    if (!window.confirm(`Are you sure you want to restore the backup "${filename}"? This action will replace all your current data.`)) {
      return;
    }

    try {
      setRestoring(filename);
      setError(null);
      setSuccess(null);
      await backupService.restoreBackup(filename);
      setSuccess(`Backup "${filename}" restored successfully! The page will reload.`);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to restore backup');
      setRestoring(null);
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete the backup "${filename}"?`)) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      await backupService.deleteBackup(filename);
      setSuccess(`Backup "${filename}" deleted successfully!`);
      await loadBackups();
    } catch (err) {
      setError(err.message || 'Failed to delete backup');
    }
  };

  const handleCleanupRestoreBackups = async () => {
    if (!window.confirm('Do you want to clean up temporary backup files created during previous restorations? (db.sqlite.backup.*, images.backup.*, ebooks.backup.*)')) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      const result = await backupService.cleanupRestoreBackups();
      setSuccess(`${result.cleanedCount} temporary backup file(s)/directory(ies) cleaned up!`);
    } catch (err) {
      setError(err.message || 'Failed to cleanup restore backups');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        setError('Please select a ZIP file');
        return;
      }
      setUploadFile(file);
      setError(null);
    }
  };

  const handleUploadAndRestore = async () => {
    if (!uploadFile) {
      setError('Please select a backup file');
      return;
    }

    if (!window.confirm(`Are you sure you want to restore the backup "${uploadFile.name}"? This action will replace all your current data.`)) {
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setSuccess(null);
      await backupService.uploadAndRestoreBackup(uploadFile);
      setSuccess(`Backup "${uploadFile.name}" uploaded and restored successfully! The page will reload.`);
      setUploadFile(null);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to upload and restore backup');
      setUploading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="backup-page">
      <div className="backup-page-header">
        <h1>Backup Management</h1>
        <p className="backup-description">
          Create, download and restore backups of your database, images and ebooks.
        </p>
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <BsXCircle className="me-2" />
          {error}
          <button
            type="button"
            className="btn-close"
            onClick={() => setError(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      {success && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          <BsCheckCircle className="me-2" />
          {success}
          <button
            type="button"
            className="btn-close"
            onClick={() => setSuccess(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      <div className="backup-actions">
        <div className="backup-action-card">
          <h3>Create a new backup</h3>
          <p>Create a complete backup of your database, images and ebooks.</p>
          <button
            className="btn btn-primary"
            onClick={handleCreateBackup}
            disabled={creating}
          >
            {creating ? (
              <>
                <BsClock className="me-2 spinning" />
                Creating...
              </>
            ) : (
              <>
                <BsPlus className="me-2" />
                Create backup
              </>
            )}
          </button>
        </div>

        <div className="backup-action-card">
          <h3>Restore from file</h3>
          <p>Upload and restore a backup from your computer.</p>
          <div className="upload-section">
            <input
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="form-control mb-2"
              id="backup-file-input"
            />
            {uploadFile && (
              <div className="upload-file-info">
                <small>Selected file: {uploadFile.name}</small>
              </div>
            )}
            <button
              className="btn btn-warning"
              onClick={handleUploadAndRestore}
              disabled={!uploadFile || uploading}
            >
              {uploading ? (
                <>
                  <BsClock className="me-2 spinning" />
                  Restoring...
                </>
              ) : (
                <>
                  <BsUpload className="me-2" />
                  Upload and restore
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="backups-list">
        <div className="backups-list-header">
          <h2>Available backups</h2>
          <div className="backups-list-actions">
            <button
              className="btn btn-sm btn-outline-warning"
              onClick={handleCleanupRestoreBackups}
              title="Clean up temporary backup files (db.sqlite.backup.*, images.backup.*, ebooks.backup.*)"
            >
              Clean temporary files
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={loadBackups}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
        
        <div className="backup-info-box">
          <p><strong>Note:</strong> The <code>pre_restore_*.zip</code> files are complete backups automatically created before each restoration for your safety. You can delete them if you no longer need them.</p>
        </div>

        {loading && backups.length === 0 ? (
          <div className="loading-message">
            <BsClock className="spinning me-2" />
            Loading backups...
          </div>
        ) : backups.length === 0 ? (
          <div className="no-backups">
            <p>No backups available. Create your first backup above.</p>
          </div>
        ) : (
          <div className="backups-table-container">
            <table className="table table-dark table-striped table-hover">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.filename}>
                    <td>
                      <code>{backup.filename}</code>
                    </td>
                    <td>{formatFileSize(backup.size)}</td>
                    <td>{formatDate(backup.created)}</td>
                    <td>
                      <div className="backup-actions-buttons">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => handleDownloadBackup(backup.filename)}
                          title="Download"
                        >
                          <BsDownload />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-warning"
                          onClick={() => handleRestoreBackup(backup.filename)}
                          disabled={restoring === backup.filename}
                          title="Restore"
                        >
                          {restoring === backup.filename ? (
                            <BsClock className="spinning" />
                          ) : (
                            <BsArrowClockwise />
                          )}
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDeleteBackup(backup.filename)}
                          title="Delete"
                        >
                          <BsTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackupPage;

