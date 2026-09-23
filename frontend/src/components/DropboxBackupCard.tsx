import React, { useEffect, useState } from 'react';
import { BsCloudUpload, BsExclamationTriangle } from 'react-icons/bs';
import backupService, { DropboxStatus } from '../services/backupService';

const HOUR = 3600 * 1000;
const STALE_AFTER = 48 * HOUR;

export const formatAge = (ms: number): string => {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))} min ago`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)} h ago`;
  return `${Math.round(ms / (24 * HOUR))} days ago`;
};

const formatSize = (bytes: number): string => `${Math.round(bytes / 1024 / 1024)} MB`;

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
    if (!status?.running || busy) return;
    const interval = setInterval(load, 10000);
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
        <button className="btn btn-outline-danger" onClick={() => handleRun(true)} disabled={running}>
          Back up anyway
        </button>
      )}
      {status.lastWarning && <p className="text-warning">{status.lastWarning}</p>}
      {requestError && <p className="text-danger">{requestError}</p>}
      {status.nextRunAt && <p>Next run: {new Date(status.nextRunAt).toLocaleString()}</p>}

      <button className="btn btn-primary" onClick={() => handleRun()} disabled={running}>
        {running ? 'Backing up…' : 'Back up now'}
      </button>
    </div>
  );
};

export default DropboxBackupCard;
