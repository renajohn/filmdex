import React, { useEffect, useState } from 'react';
import { BsCloudUpload, BsExclamationTriangle } from 'react-icons/bs';
import backupService, { BackupProgress, DropboxStatus } from '../services/backupService';

const HOUR = 3600 * 1000;
const STALE_AFTER = 48 * HOUR;

export const formatAge = (ms: number): string => {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))} min ago`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)} h ago`;
  return `${Math.round(ms / (24 * HOUR))} days ago`;
};

const formatSize = (bytes: number): string => `${Math.round(bytes / 1024 / 1024)} MB`;

// One decimal, same MiB-based math as formatSize, for the finer-grained upload readout.
const formatSizeDecimal = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);

const ProgressDisplay: React.FC<{ progress: BackupProgress }> = ({ progress }) => {
  switch (progress.phase) {
    case 'checking':
      return <p>Checking…</p>;
    case 'archiving':
      return <p>Creating archive…</p>;
    case 'rotating':
      return <p>Removing old backups…</p>;
    case 'uploading': {
      if (!progress.totalBytes) return <p>Uploading…</p>;
      const pct = Math.round(((progress.uploadedBytes ?? 0) / progress.totalBytes) * 100);
      return (
        <>
          <p>{`Uploading ${formatSizeDecimal(progress.uploadedBytes ?? 0)} / ${formatSizeDecimal(progress.totalBytes)} MB`}</p>
          <div className="progress">
            <div
              className="progress-bar"
              role="progressbar"
              style={{ width: `${pct}%` }}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </>
      );
    }
    default:
      return null;
  }
};

const DropboxBackupCard: React.FC = () => {
  const [status, setStatus] = useState<DropboxStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const load = async () => {
    try {
      setStatus(await backupService.getDropboxStatus());
      setRequestError(null);
    } catch (err) {
      setRequestError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!busy && !status?.running) return;
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [status?.running, busy]);

  const handleRun = async (force = false) => {
    setBusy(true);
    setRequestError(null);
    try {
      const result = await backupService.runDropboxBackup(force);
      setStatus(result.status);
    } catch (err) {
      setRequestError((err as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return requestError ? <div className="backup-action-card dropbox-card"><p>{requestError}</p></div> : null;
  }

  if (!status.configured) {
    return (
      <div className="backup-action-card dropbox-card">
        <h3><BsCloudUpload className="me-2" />Dropbox backup</h3>
        <p>
          Dropbox backup is not configured. Set DROPBOX_APP_KEY, DROPBOX_APP_SECRET and
          DROPBOX_REFRESH_TOKEN on the server (see the README).
        </p>
      </div>
    );
  }

  const now = Date.now();
  const lastSuccess = status.lastSuccessAt ? new Date(status.lastSuccessAt).getTime() : null;
  const lastError = status.lastErrorAt ? new Date(status.lastErrorAt).getTime() : null;
  const stale = lastSuccess === null || now - lastSuccess > STALE_AFTER;
  const showError = status.lastError && lastError !== null && (lastSuccess === null || lastError > lastSuccess);
  const running = busy || status.running;

  return (
    <div className="backup-action-card dropbox-card">
      <h3><BsCloudUpload className="me-2" />Dropbox backup</h3>

      {stale && (
        <div className="alert alert-warning" role="alert">
          <BsExclamationTriangle className="me-2" />
          No successful Dropbox backup in the last 48 hours.
        </div>
      )}

      <p>
        {lastSuccess !== null
          ? `Last backup: ${formatAge(now - lastSuccess)}${status.lastSuccessSize !== null ? ` (${formatSize(status.lastSuccessSize)})` : ''}`
          : 'No backup uploaded yet.'}
      </p>
      {showError && (
        <p className="text-danger">
          Last error ({new Date(status.lastErrorAt as string).toLocaleString()}): {status.lastError}
        </p>
      )}
      {showError && status.lastRefused && (
        <button className="btn btn-outline-danger mb-3" onClick={() => handleRun(true)} disabled={running}>
          Back up anyway
        </button>
      )}
      {status.lastWarning && <p className="text-warning">{status.lastWarning}</p>}
      {requestError && <p className="text-danger">{requestError}</p>}
      {status.nextRunAt && <p>Next run: {new Date(status.nextRunAt).toLocaleString()}</p>}

      <button className="btn btn-primary" onClick={() => handleRun()} disabled={running}>
        {running ? 'Backing up…' : 'Back up now'}
      </button>
      {status.progress && <div className="mt-3"><ProgressDisplay progress={status.progress} /></div>}
    </div>
  );
};

export default DropboxBackupCard;
