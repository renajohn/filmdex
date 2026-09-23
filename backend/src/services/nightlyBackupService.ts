import fs from 'fs';
import path from 'path';
import backupService from './backupService';
import dropbox from './dropboxService';
import logger from '../logger';

export const KEEP = 7;
const NAME_PATTERN = /^dexvault_\d{4}-\d{2}-\d{2}\.zip$/;

// Below this fraction of the most recent remote backup's size, the new backup is refused
// rather than uploaded: see the "empty or shrunken backup" guard in runOnce.
export const MIN_SIZE_RATIO = 0.5;

export interface BackupStatus {
  lastSuccessAt: string | null;
  lastSuccessFile: string | null;
  lastSuccessSize: number | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastWarning: string | null;
  lastRefused: boolean;
}

const EMPTY_STATUS: BackupStatus = {
  lastSuccessAt: null, lastSuccessFile: null, lastSuccessSize: null,
  lastErrorAt: null, lastError: null, lastWarning: null, lastRefused: false,
};

export class BackupAlreadyRunningError extends Error {
  constructor() { super('A Dropbox backup is already running'); }
}

// Raised instead of uploading when the backup looks like data loss rather than a real
// backup: an empty collection, or a zip far smaller than the last one on Dropbox.
export class BackupRefusedError extends Error {}

// One decimal: whole-MiB rounding made the refusal message meaningless for small backups
// ("0 MB vs 0 MB").
const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);

const pad = (n: number) => String(n).padStart(2, '0');

// Local date on purpose: the file of the 3 a.m. run carries the day it ran in Zurich.
export const remoteName = (now: Date): string =>
  `dexvault_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;

// Rotation by count, not age: after a week of failures the last good backups are still there.
// The date in the name sorts lexically; files outside the pattern are never touched.
export const pickToDelete = (names: string[], keep = KEEP): string[] =>
  names.filter(n => NAME_PATTERN.test(n)).sort().reverse().slice(keep);

export const BACKUP_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CATCH_UP_DELAY_MS = 5 * 60 * 1000;

// setHours works in local time, so the result follows the TZ of the container across
// daylight saving changes; setHours again after moving a day for the same reason.
export const nextRunAt = (hour: number, now: Date): Date => {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
    next.setHours(hour, 0, 0, 0);
  }
  return next;
};

export const msUntilNext = (hour: number, now: Date): number =>
  nextRunAt(hour, now).getTime() - now.getTime();

export const isStale = (status: BackupStatus, now: Date, maxAgeMs: number): boolean =>
  !status.lastSuccessAt || now.getTime() - new Date(status.lastSuccessAt).getTime() > maxAgeMs;

const statusPath = () => path.join(backupService.getBackupDir(), 'dropbox-status.json');

let running = false;

// Helper to persist status non-throwing; logs instead of rejecting.
// Ensures runOnce never rejects except for BackupAlreadyRunningError.
const persistStatus = (status: BackupStatus): void => {
  try {
    nightlyBackupService.writeStatus(status);
  } catch (error) {
    const message = (error as Error).message || String(error);
    logger.error(`Dropbox backup: could not write status: ${message}`);
  }
};

const nightlyBackupService = {
  readStatus(): BackupStatus {
    try {
      return { ...EMPTY_STATUS, ...JSON.parse(fs.readFileSync(statusPath(), 'utf8')) };
    } catch {
      return { ...EMPTY_STATUS };
    }
  },

  writeStatus(status: BackupStatus): void {
    fs.writeFileSync(statusPath(), JSON.stringify(status, null, 2));
  },

  isRunning(): boolean {
    return running;
  },

  async runOnce(now: Date = new Date(), options: { force?: boolean } = {}): Promise<{ ok: boolean; status: BackupStatus }> {
    if (running) throw new BackupAlreadyRunningError();
    running = true;
    const previous = nightlyBackupService.readStatus();
    let localZip: string | null = null;
    try {
      // Guard against an empty or shrunken backup: the volume was lost, the server restarted
      // on a fresh database, and the catch-up run would otherwise upload nothing useful,
      // silently pushing every good backup out of the 7-day rotation.
      if (!options.force && await backupService.countCollectionItems() === 0) {
        throw new BackupRefusedError('Refused: the collection is empty (0 items). Nothing was uploaded.');
      }

      const backup = await backupService.createBackup();
      // Track the file to clean up from its actual path first: if the rename below throws,
      // the finally block still removes the original backup_*.zip instead of leaking it.
      localZip = backup.path;
      const name = remoteName(now);
      // Rename to the nightly-only name so a crash mid-run leaves something the startup
      // cleanup can recognise and remove, without touching a user's manual backups.
      const renamedZip = path.join(backupService.getBackupDir(), name);
      fs.renameSync(backup.path, renamedZip);
      localZip = renamedZip;

      if (!options.force) {
        const remoteFiles = await dropbox.listFiles('');
        // Same pattern and ordering as the rotation below: the most recent dexvault_*.zip by name.
        const latest = remoteFiles
          .filter(f => NAME_PATTERN.test(f.name))
          .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0))[0];
        if (latest && backup.size < MIN_SIZE_RATIO * latest.size) {
          throw new BackupRefusedError(
            `Refused: backup is ${mb(backup.size)} MB vs ${mb(latest.size)} MB for ${latest.name}. Nothing was uploaded.`
          );
        }
      }

      await dropbox.uploadFile(localZip, `/${name}`);

      // The backup of the day is safe from here on: a failed rotation is only a warning.
      let lastWarning: string | null = null;
      try {
        const remoteFiles = await dropbox.listFiles('');
        for (const old of pickToDelete(remoteFiles.map(f => f.name))) {
          await dropbox.deleteFile(`/${old}`);
        }
      } catch (error) {
        lastWarning = `Rotation failed: ${(error as Error).message}`;
        logger.warn(`Dropbox backup: ${lastWarning}`);
      }

      const status: BackupStatus = {
        lastSuccessAt: now.toISOString(), lastSuccessFile: name, lastSuccessSize: backup.size,
        lastErrorAt: null, lastError: null, lastWarning, lastRefused: false,
      };
      persistStatus(status);
      logger.info(`Dropbox backup uploaded: ${name} (${backup.sizeMB} MB)`);
      return { ok: true, status };
    } catch (error) {
      const message = (error as Error).message || String(error);
      const status: BackupStatus = {
        ...previous, lastErrorAt: now.toISOString(), lastError: message,
        lastRefused: error instanceof BackupRefusedError,
      };
      persistStatus(status);
      logger.error(`Dropbox backup failed: ${message}`);
      return { ok: false, status };
    } finally {
      // On the same volume as the database, the local zip protects from nothing.
      if (localZip) fs.rmSync(localZip, { force: true });
      running = false;
    }
  },
};

// Only the nightly job ever creates dexvault_*.zip locally, and it always removes it
// before returning (see runOnce's finally). One still there at startup means the process
// died mid-run; it is never a user's manual backup (backup_*, pre_restore_*, uploaded_*).
export const removeLeftoverLocalZips = (): void => {
  const dir = backupService.getBackupDir();
  for (const file of fs.readdirSync(dir)) {
    if (!NAME_PATTERN.test(file)) continue;
    try {
      fs.rmSync(path.join(dir, file), { force: true });
      logger.info(`Removed leftover local backup: ${file}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Failed to remove leftover local backup ${file}:`, message);
    }
  }
};

const runLogged = (): void => {
  nightlyBackupService.runOnce().catch(error => {
    // Only BackupAlreadyRunningError can land here: a manual run is in progress.
    logger.info(`Dropbox backup skipped: ${(error as Error).message}`);
  });
};

// A fresh setTimeout for every night rather than a 24 h setInterval, which would drift
// with the time of the last restart and with daylight saving changes.
export const startNightlyBackup = (): void => {
  if (process.env.NODE_ENV === 'test' || !dropbox.isConfigured()) return;

  // A process that died mid-backup leaves a .snapshot-*.sqlite or a dexvault_*.zip
  // behind forever otherwise.
  backupService.removeStaleSnapshots();
  removeLeftoverLocalZips();

  const now = new Date();

  const schedule = () => {
    setTimeout(() => { runLogged(); schedule(); }, msUntilNext(BACKUP_HOUR, new Date())).unref();
  };
  schedule();

  // The server was off at 3 a.m., or has never backed up: do not wait for tomorrow night.
  if (isStale(nightlyBackupService.readStatus(), now, DAY_MS)) {
    // Re-check staleness once the delay elapses: if the scheduled 3 a.m. run already
    // happened in the meantime (e.g. server started at 02:57), skip the catch-up.
    setTimeout(() => {
      if (isStale(nightlyBackupService.readStatus(), new Date(), DAY_MS)) runLogged();
    }, CATCH_UP_DELAY_MS).unref();
  }
  const next = nextRunAt(BACKUP_HOUR, now);
  logger.info(`Dropbox backup scheduled, next run at ${next.toISOString()} (${next.toString()})`);
};

export default nightlyBackupService;
