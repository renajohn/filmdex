import fs from 'fs';
import path from 'path';
import backupService from '../../src/services/backupService';

const HOUR_MS = 60 * 60 * 1000;

const writeFile = (name: string, mtimeMs: number) => {
  const filePath = path.join(backupService.getBackupDir(), name);
  fs.writeFileSync(filePath, 'x');
  const seconds = mtimeMs / 1000;
  fs.utimesSync(filePath, seconds, seconds);
  return filePath;
};

const exists = (filePath: string) => fs.existsSync(filePath);

describe('removeStaleSnapshots', () => {
  it('supprime les vieux snapshots, garde les recents et les fichiers etrangers', () => {
    const now = Date.now();
    const old = writeFile('.snapshot-1.sqlite', now - 2 * HOUR_MS);
    const fresh = writeFile('.snapshot-2.sqlite', now - 10 * 1000);
    const unrelated = writeFile('notes.txt', now - 2 * HOUR_MS);
    const zip = writeFile('backup_2026-09-23.zip', now - 2 * HOUR_MS);

    try {
      backupService.removeStaleSnapshots(HOUR_MS);

      expect(exists(old)).toBe(false);
      expect(exists(fresh)).toBe(true);
      expect(exists(unrelated)).toBe(true);
      expect(exists(zip)).toBe(true);
    } finally {
      [old, fresh, unrelated, zip].forEach(f => fs.rmSync(f, { force: true }));
    }
  });
});
