import fs from 'fs';
import path from 'path';
import backupService from '../../src/services/backupService';
import dropbox from '../../src/services/dropboxService';
import logger from '../../src/logger';
import nightly, { BackupAlreadyRunningError, pickToDelete, remoteName, removeLeftoverLocalZips } from '../../src/services/nightlyBackupService';

const statusFile = () => path.join(backupService.getBackupDir(), 'dropbox-status.json');
const NOW = new Date(2026, 8, 24, 3, 0, 0); // 24 septembre 2026, 3 h locale

// createBackup is replaced by a fake that writes a small zip, so each test can check it is removed.
const fakeZip = () => {
  const file = path.join(backupService.getBackupDir(), `backup_test_${Math.random()}.zip`);
  fs.writeFileSync(file, 'zip');
  jest.spyOn(backupService, 'createBackup').mockResolvedValue({ filename: path.basename(file), path: file, size: 3, sizeMB: 0 });
  return file;
};

beforeEach(() => fs.rmSync(statusFile(), { force: true }));
afterEach(() => jest.restoreAllMocks());

describe('remoteName', () => {
  it('porte la date locale', () => {
    expect(remoteName(NOW)).toBe('dexvault_2026-09-24.zip');
  });
});

describe('removeLeftoverLocalZips', () => {
  it('supprime un dexvault_*.zip oublie mais garde les sauvegardes manuelles', () => {
    const dir = backupService.getBackupDir();
    const leftover = path.join(dir, 'dexvault_2026-09-20.zip');
    const manual = path.join(dir, 'backup_x.zip');
    const preRestore = path.join(dir, 'pre_restore_1.zip');
    const uploaded = path.join(dir, 'uploaded_1_x.zip');
    [leftover, manual, preRestore, uploaded].forEach(f => fs.writeFileSync(f, 'zip'));

    try {
      removeLeftoverLocalZips();

      expect(fs.existsSync(leftover)).toBe(false);
      expect(fs.existsSync(manual)).toBe(true);
      expect(fs.existsSync(preRestore)).toBe(true);
      expect(fs.existsSync(uploaded)).toBe(true);
    } finally {
      [manual, preRestore, uploaded].forEach(f => fs.rmSync(f, { force: true }));
    }
  });
});

describe('pickToDelete', () => {
  it('garde les 7 plus recents et ignore les fichiers etrangers', () => {
    const days = ['16', '17', '18', '19', '20', '21', '22', '23', '24'].map(d => `dexvault_2026-09-${d}.zip`);
    const names = [...days.slice(4), 'notes.txt', 'backup_2026-01-01.zip', ...days.slice(0, 4)];
    expect(pickToDelete(names).sort()).toEqual(['dexvault_2026-09-16.zip', 'dexvault_2026-09-17.zip']);
  });

  it('ne supprime rien quand il y en a 7 ou moins', () => {
    expect(pickToDelete(['dexvault_2026-09-24.zip', 'dexvault_2026-09-23.zip'])).toEqual([]);
  });
});

describe('runOnce', () => {
  it('envoie, fait tourner, ecrit etat et supprime le zip local', async () => {
    const zip = fakeZip();
    const renamedZip = path.join(backupService.getBackupDir(), 'dexvault_2026-09-24.zip');
    const upload = jest.spyOn(dropbox, 'uploadFile').mockResolvedValue();
    const existing = ['16', '17', '18', '19', '20', '21', '22', '23', '24'].map(d => `dexvault_2026-09-${d}.zip`);
    jest.spyOn(dropbox, 'listFiles').mockResolvedValue([...existing, 'notes.txt']);
    const del = jest.spyOn(dropbox, 'deleteFile').mockResolvedValue();

    const { ok, status } = await nightly.runOnce(NOW);

    expect(ok).toBe(true);
    // The local zip is renamed to the nightly-only name before upload, so a crash mid-run
    // leaves something the startup cleanup can tell apart from a user's manual backup.
    expect(upload).toHaveBeenCalledWith(renamedZip, '/dexvault_2026-09-24.zip');
    expect(del.mock.calls.map(c => c[0]).sort()).toEqual(['/dexvault_2026-09-16.zip', '/dexvault_2026-09-17.zip']);
    expect(status).toMatchObject({
      lastSuccessAt: NOW.toISOString(), lastSuccessFile: 'dexvault_2026-09-24.zip', lastSuccessSize: 3,
      lastError: null, lastErrorAt: null, lastWarning: null,
    });
    expect(nightly.readStatus()).toEqual(status);
    expect(fs.existsSync(zip)).toBe(false);
    expect(fs.existsSync(renamedZip)).toBe(false);
  });

  it('ne supprime rien et consigne erreur si envoi echoue', async () => {
    const zip = fakeZip();
    const renamedZip = path.join(backupService.getBackupDir(), 'dexvault_2026-09-24.zip');
    jest.spyOn(dropbox, 'uploadFile').mockRejectedValue(new Error('Dropbox 409: path/insufficient_space/..'));
    const list = jest.spyOn(dropbox, 'listFiles');
    const del = jest.spyOn(dropbox, 'deleteFile');

    const { ok, status } = await nightly.runOnce(NOW);

    expect(ok).toBe(false);
    expect(list).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(status).toMatchObject({ lastErrorAt: NOW.toISOString(), lastError: 'Dropbox 409: path/insufficient_space/..' });
    expect(fs.existsSync(zip)).toBe(false);
    expect(fs.existsSync(renamedZip)).toBe(false);
  });

  it('garde la derniere reussite quand execution suivante echoue', async () => {
    fakeZip();
    jest.spyOn(dropbox, 'uploadFile').mockResolvedValue();
    jest.spyOn(dropbox, 'listFiles').mockResolvedValue([]);
    await nightly.runOnce(NOW);
    jest.restoreAllMocks();

    jest.spyOn(backupService, 'createBackup').mockRejectedValue(new Error('disque plein'));
    const later = new Date(NOW.getTime() + 24 * 3600 * 1000);
    const { status } = await nightly.runOnce(later);

    expect(status).toMatchObject({ lastSuccessAt: NOW.toISOString(), lastError: 'disque plein', lastErrorAt: later.toISOString() });
  });

  it('compte comme reussie execution dont seule rotation echoue', async () => {
    fakeZip();
    jest.spyOn(dropbox, 'uploadFile').mockResolvedValue();
    jest.spyOn(dropbox, 'listFiles').mockRejectedValue(new Error('Dropbox 500: internal'));

    const { ok, status } = await nightly.runOnce(NOW);

    expect(ok).toBe(true);
    expect(status).toMatchObject({ lastSuccessAt: NOW.toISOString(), lastError: null, lastWarning: 'Rotation failed: Dropbox 500: internal' });
  });

  it('refuse une seconde execution concurrente', async () => {
    fakeZip();
    let release: () => void = () => {};
    jest.spyOn(dropbox, 'uploadFile').mockImplementation(() => new Promise<void>(r => { release = r; }));
    jest.spyOn(dropbox, 'listFiles').mockResolvedValue([]);

    const first = nightly.runOnce(NOW);
    await new Promise(r => setImmediate(r));
    expect(nightly.isRunning()).toBe(true);
    await expect(nightly.runOnce(NOW)).rejects.toBeInstanceOf(BackupAlreadyRunningError);

    release();
    expect((await first).ok).toBe(true);
    expect(nightly.isRunning()).toBe(false);
  });

  it('renvoie un etat vide avant toute execution', () => {
    expect(nightly.readStatus()).toEqual({
      lastSuccessAt: null, lastSuccessFile: null, lastSuccessSize: null,
      lastErrorAt: null, lastError: null, lastWarning: null,
    });
  });

  it('reste ok true quand upload reussit mais ecriture etat echoue', async () => {
    fakeZip();
    jest.spyOn(dropbox, 'uploadFile').mockResolvedValue();
    jest.spyOn(dropbox, 'listFiles').mockResolvedValue([]);
    const writeStatus = jest.spyOn(nightly, 'writeStatus').mockImplementation(() => { throw new Error('EACCES'); });
    jest.spyOn(logger, 'error').mockImplementation(() => {});

    const { ok, status } = await nightly.runOnce(NOW);

    expect(ok).toBe(true);
    expect(status.lastSuccessAt).toBe(NOW.toISOString());
    expect(writeStatus).toHaveBeenCalled();
    expect(nightly.isRunning()).toBe(false);
  });

  it('reste ok false quand upload echoue et ecriture etat echoue', async () => {
    const zip = fakeZip();
    jest.spyOn(dropbox, 'uploadFile').mockRejectedValue(new Error('Dropbox error'));
    const writeStatus = jest.spyOn(nightly, 'writeStatus').mockImplementation(() => { throw new Error('EACCES'); });
    jest.spyOn(logger, 'error').mockImplementation(() => {});

    const { ok } = await nightly.runOnce(NOW);

    expect(ok).toBe(false);
    expect(writeStatus).toHaveBeenCalled();
    expect(nightly.isRunning()).toBe(false);
    expect(fs.existsSync(zip)).toBe(false);
  });
});
