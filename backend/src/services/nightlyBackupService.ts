import fs from 'fs';
import path from 'path';
import backupService from './backupService';
import dropbox from './dropboxService';
import logger from '../logger';

export const KEEP = 7;
const NAME_PATTERN = /^dexvault_\d{4}-\d{2}-\d{2}\.zip$/;

export interface BackupStatus {
  lastSuccessAt: string | null;
  lastSuccessFile: string | null;
  lastSuccessSize: number | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastWarning: string | null;
}

const EMPTY_STATUS: BackupStatus = {
  lastSuccessAt: null, lastSuccessFile: null, lastSuccessSize: null,
  lastErrorAt: null, lastError: null, lastWarning: null,
};

export class BackupAlreadyRunningError extends Error {
  constructor() { super('A Dropbox backup is already running'); }
}

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

  async runOnce(now: Date = new Date()): Promise<{ ok: boolean; status: BackupStatus }> {
    if (running) throw new BackupAlreadyRunningError();
    running = true;
    const previous = nightlyBackupService.readStatus();
    let localZip: string | null = null;
    try {
      const backup = await backupService.createBackup();
      localZip = backup.path;
      const name = remoteName(now);
      await dropbox.uploadFile(backup.path, `/${name}`);

      // The backup of the day is safe from here on: a failed rotation is only a warning.
      let lastWarning: string | null = null;
      try {
        for (const old of pickToDelete(await dropbox.listFiles(''))) {
          await dropbox.deleteFile(`/${old}`);
        }
      } catch (error) {
        lastWarning = `Rotation failed: ${(error as Error).message}`;
        logger.warn(`Dropbox backup: ${lastWarning}`);
      }

      const status: BackupStatus = {
        lastSuccessAt: now.toISOString(), lastSuccessFile: name, lastSuccessSize: backup.size,
        lastErrorAt: null, lastError: null, lastWarning,
      };
      persistStatus(status);
      logger.info(`Dropbox backup uploaded: ${name} (${backup.sizeMB} MB)`);
      return { ok: true, status };
    } catch (error) {
      const message = (error as Error).message || String(error);
      const status: BackupStatus = { ...previous, lastErrorAt: now.toISOString(), lastError: message };
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

  const schedule = () => {
    setTimeout(() => { runLogged(); schedule(); }, msUntilNext(BACKUP_HOUR, new Date())).unref();
  };
  schedule();

  // The server was off at 3 a.m., or has never backed up: do not wait for tomorrow night.
  if (isStale(nightlyBackupService.readStatus(), new Date(), DAY_MS)) {
    setTimeout(runLogged, CATCH_UP_DELAY_MS).unref();
  }
  logger.info(`Dropbox backup scheduled, next run at ${nextRunAt(BACKUP_HOUR, new Date()).toISOString()}`);
};

export default nightlyBackupService;
