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
  });

  it('supprime le snapshot même quand l\'archivage échoue', async () => {
    const archiveSpy = jest.spyOn(backupService, 'writeArchive').mockRejectedValue(new Error('disque plein'));

    await expect(backupService.createBackup()).rejects.toThrow('disque plein');
    expect(archiveSpy).toHaveBeenCalled();
    expect(snapshots()).toEqual([]);
  });
});
