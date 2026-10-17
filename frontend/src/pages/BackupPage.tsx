
import React, { useState, useEffect } from 'react';
import backupService from '../services/backupService';
import { BsDownload, BsTrash, BsArrowClockwise, BsPlus, BsUpload, BsCheckCircle, BsXCircle, BsClock } from 'react-icons/bs';
import DropboxBackupCard from '../components/DropboxBackupCard';
import './BackupPage.css';
import Button, { IconButton } from '../components/shared/Button';
import { BsX } from 'react-icons/bs';
import { confirm } from '../components/shared/ConfirmDialog';

interface Backup {
  filename: string;
  size: number;
  created: string;
}

const BackupPage: React.FC = () => {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      setLoading(true);
      setError(null);
      const backupList = await backupService.listBackups() as Backup[];
      setBackups(backupList);
    } catch (err) {
      setError((err as Error).message || 'Failed to load backups');
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
      setError((err as Error).message || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      setError(null);
      await backupService.downloadBackup(filename);
      setSuccess(`Download of ${filename} started`);
    } catch (err) {
      setError((err as Error).message || 'Failed to download backup');
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!(await confirm({ title: 'Restore this backup?', message: `“${filename}” replaces all your current data.`, confirmLabel: 'Restore', danger: true }))) {
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
      setError((err as Error).message || 'Failed to restore backup');
      setRestoring(null);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!(await confirm({ title: 'Delete this backup?', message: `“${filename}” goes for good.`, confirmLabel: 'Delete', danger: true }))) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      await backupService.deleteBackup(filename);
      setSuccess(`Backup "${filename}" deleted successfully!`);
      await loadBackups();
    } catch (err) {
      setError((err as Error).message || 'Failed to delete backup');
    }
  };

  const handleCleanupRestoreBackups = async () => {
    if (!(await confirm({ title: 'Clean up temporary files?', message: 'The copies left by earlier restorations (db.sqlite.backup.*, images.backup.*, ebooks.backup.*) go.', confirmLabel: 'Clean up' }))) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      const result = await backupService.cleanupRestoreBackups() as { cleanedCount: number };
      setSuccess(`${result.cleanedCount} temporary backup file(s)/directory(ies) cleaned up!`);
    } catch (err) {
      setError((err as Error).message || 'Failed to cleanup restore backups');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

    if (!(await confirm({ title: 'Restore this backup?', message: `“${uploadFile.name}” replaces all your current data.`, confirmLabel: 'Restore', danger: true }))) {
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
      setError((err as Error).message || 'Failed to upload and restore backup');
      setUploading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes: number) => {
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
          <IconButton label="Close"
            onClick={() => setError(null)}
          ><BsX /></IconButton>
        </div>
      )}

      {success && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          <BsCheckCircle className="me-2" />
          {success}
          <IconButton label="Close"
            onClick={() => setSuccess(null)}
          ><BsX /></IconButton>
        </div>
      )}

      <DropboxBackupCard />

      <div className="backup-actions">
        <div className="backup-action-card">
          <h3>Create a new backup</h3>
          <p>Create a complete backup of your database, images and ebooks.</p>
          <Button variant="primary"
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
          </Button>
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
            <Button variant="danger"
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
            </Button>
          </div>
        </div>
      </div>

      <div className="backups-list">
        <div className="backups-list-header">
          <h2>Available backups</h2>
          <div className="backups-list-actions">
            <Button size="sm"
              onClick={handleCleanupRestoreBackups}
              title="Clean up temporary backup files (db.sqlite.backup.*, images.backup.*, ebooks.backup.*)"
            >
              Clean temporary files
            </Button>
            <Button size="sm"
              onClick={loadBackups}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
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
                        <IconButton label="Download" size="sm"
                          onClick={() => handleDownloadBackup(backup.filename)}
                          title="Download"
                        ><BsDownload /></IconButton>
                        <Button size="sm"
                          onClick={() => handleRestoreBackup(backup.filename)}
                          disabled={restoring === backup.filename}
                          title="Restore"
                        >
                          {restoring === backup.filename ? (
                            <BsClock className="spinning" />
                          ) : (
                            <BsArrowClockwise />
                          )}
                        </Button>
                        <IconButton label="Delete" tone="danger" size="sm"
                          onClick={() => handleDeleteBackup(backup.filename)}
                          title="Delete"
                        ><BsTrash /></IconButton>
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
