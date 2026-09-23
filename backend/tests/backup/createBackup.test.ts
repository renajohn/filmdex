import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import sqlite3 from 'sqlite3';
import { getDatabase } from '../../src/database';
import backupService from '../../src/services/backupService';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<void>((resolve, reject) =>
    getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const snapshots = () =>
  fs.readdirSync(backupService.getBackupDir()).filter(f => f.startsWith('.snapshot-'));

afterEach(() => jest.restoreAllMocks());

describe('createBackup', () => {
  it('met dans le zip une base lisible qui contient les données', async () => {
    const title = `Snapshot ${Math.random()}`;
    await run(`INSERT INTO movies (title, title_status) VALUES (?, 'owned')`, [title]);

    const result = await backupService.createBackup();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dexvault-zip-'));
    new AdmZip(result.path).extractEntryTo('db.sqlite', dir, false, true);
    fs.rmSync(result.path);

    const copy = new sqlite3.Database(path.join(dir, 'db.sqlite'));
    const row = await new Promise<{ n: number }>((resolve, reject) =>
      copy.get('SELECT COUNT(*) AS n FROM movies WHERE title = ?', [title],
        (err: Error | null, r: { n: number }) => (err ? reject(err) : resolve(r))));
    copy.close();

    expect(row.n).toBe(1);
    expect(snapshots()).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('supprime le snapshot même quand l\'archivage échoue', async () => {
    const archiveSpy = jest.spyOn(backupService, 'writeArchive').mockRejectedValue(new Error('disque plein'));

    await expect(backupService.createBackup()).rejects.toThrow('disque plein');
    expect(archiveSpy).toHaveBeenCalled();
    expect(snapshots()).toEqual([]);
  });

  it("rejette et nettoie sans uncaughtException quand le flux d'ecriture echoue", async () => {
    const originalCreateWriteStream = fs.createWriteStream.bind(fs);
    jest.spyOn(fs, 'createWriteStream').mockImplementation((...args: Parameters<typeof fs.createWriteStream>) => {
      const stream = originalCreateWriteStream(...args);
      process.nextTick(() => stream.emit('error', new Error('ENOSPC: no space left on device')));
      return stream;
    });

    const uncaught = jest.fn();
    process.on('uncaughtException', uncaught);
    try {
      await expect(backupService.createBackup()).rejects.toThrow('ENOSPC');
    } finally {
      process.off('uncaughtException', uncaught);
    }

    expect(uncaught).not.toHaveBeenCalled();
    expect(snapshots()).toEqual([]);
    const leftoverZips = fs.readdirSync(backupService.getBackupDir()).filter(f => f.endsWith('.zip'));
    expect(leftoverZips).toEqual([]);
  });

  it('supprime le snapshot partiel si VACUUM INTO échoue', async () => {
    const runSpy = jest.spyOn(getDatabase(), 'run').mockImplementation((sql: string, params: unknown[], callback: (err: Error | null) => void) => {
      if (sql.includes('VACUUM INTO')) {
        const snapshotPath = (params as unknown[])[0] as string;
        // Write a partial file to simulate a failed VACUUM INTO
        fs.writeFileSync(snapshotPath, Buffer.alloc(100));
        // Then call the callback with an error
        callback(new Error('disque plein'));
      } else {
        // For other queries, use the original implementation
        getDatabase().run(sql, params as unknown[], callback);
      }
      return { changes: 0 } as any;
    });

    await expect(backupService.createBackup()).rejects.toThrow('disque plein');
    expect(runSpy).toHaveBeenCalled();
    expect(snapshots()).toEqual([]);
  });
});
