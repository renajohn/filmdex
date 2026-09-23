import request from 'supertest';
import app from '../../index';
import nightly, { BackupAlreadyRunningError } from '../../src/services/nightlyBackupService';

const EMPTY = {
  lastSuccessAt: null, lastSuccessFile: null, lastSuccessSize: null, lastErrorAt: null, lastError: null, lastWarning: null,
  lastRefused: false,
};

const configure = () => {
  process.env.DROPBOX_APP_KEY = 'key';
  process.env.DROPBOX_APP_SECRET = 'secret';
  process.env.DROPBOX_REFRESH_TOKEN = 'refresh';
};

afterEach(() => {
  delete process.env.DROPBOX_APP_KEY;
  delete process.env.DROPBOX_APP_SECRET;
  delete process.env.DROPBOX_REFRESH_TOKEN;
  jest.restoreAllMocks();
});

describe('GET /api/backup/dropbox/status', () => {
  it('dit non configuré et ne prévoit rien sans variables', async () => {
    jest.spyOn(nightly, 'readStatus').mockReturnValue(EMPTY);
    const res = await request(app).get('/api/backup/dropbox/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: false, running: false, nextRunAt: null, progress: null, ...EMPTY });
  });

  it("donne l'état et la prochaine exécution une fois configuré", async () => {
    configure();
    const saved = { ...EMPTY, lastSuccessAt: '2026-09-24T01:00:00.000Z', lastSuccessFile: 'dexvault_2026-09-24.zip', lastSuccessSize: 3 };
    jest.spyOn(nightly, 'readStatus').mockReturnValue(saved);
    const res = await request(app).get('/api/backup/dropbox/status');
    expect(res.body).toMatchObject({ configured: true, running: false, progress: null, ...saved });
    expect(new Date(res.body.nextRunAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('inclut la progression en cours quand une execution tourne', async () => {
    configure();
    jest.spyOn(nightly, 'readStatus').mockReturnValue(EMPTY);
    jest.spyOn(nightly, 'isRunning').mockReturnValue(true);
    jest.spyOn(nightly, 'getProgress').mockReturnValue({ phase: 'uploading', uploadedBytes: 1024, totalBytes: 2048 });
    const res = await request(app).get('/api/backup/dropbox/status');
    expect(res.body.progress).toEqual({ phase: 'uploading', uploadedBytes: 1024, totalBytes: 2048 });
  });
});

describe('POST /api/backup/dropbox/run', () => {
  it('répond 400 sans configuration', async () => {
    const run = jest.spyOn(nightly, 'runOnce');
    const res = await request(app).post('/api/backup/dropbox/run');
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('répond 409 quand une exécution est en cours', async () => {
    configure();
    jest.spyOn(nightly, 'runOnce').mockRejectedValue(new BackupAlreadyRunningError());
    const res = await request(app).post('/api/backup/dropbox/run');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('A Dropbox backup is already running');
  });

  it("renvoie le résultat de l'exécution, même en échec", async () => {
    configure();
    const failed = { ...EMPTY, lastErrorAt: '2026-09-24T01:00:00.000Z', lastError: 'Dropbox 401: expired' };
    jest.spyOn(nightly, 'runOnce').mockResolvedValue({ ok: false, status: failed });
    jest.spyOn(nightly, 'readStatus').mockReturnValue(failed);
    const res = await request(app).post('/api/backup/dropbox/run');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, status: { configured: true, lastError: 'Dropbox 401: expired' } });
  });

  it('force la sauvegarde quand le corps le demande', async () => {
    configure();
    const run = jest.spyOn(nightly, 'runOnce').mockResolvedValue({ ok: true, status: EMPTY });
    await request(app).post('/api/backup/dropbox/run').send({ force: true });
    expect(run.mock.calls[0][1]).toEqual({ force: true });
  });

  it('ne force pas sans corps', async () => {
    configure();
    const run = jest.spyOn(nightly, 'runOnce').mockResolvedValue({ ok: true, status: EMPTY });
    await request(app).post('/api/backup/dropbox/run');
    expect(run.mock.calls[0][1]).toEqual({ force: false });
  });
});
