import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import dropbox, { CHUNK_SIZE } from '../../src/services/dropboxService';

const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const CONTENT = 'https://content.dropboxapi.com/2/files';
const API = 'https://api.dropboxapi.com/2/files';

const configure = () => {
  process.env.DROPBOX_APP_KEY = 'key';
  process.env.DROPBOX_APP_SECRET = 'secret';
  process.env.DROPBOX_REFRESH_TOKEN = 'refresh';
};

const tokenResponse = { data: { access_token: 'short', expires_in: 14400 } };

// Every call goes through axios.post; route the token request apart from the API calls.
const mockPost = (handler: (url: string, body: unknown, config: any) => unknown) =>
  jest.spyOn(axios, 'post').mockImplementation(async (url: string, body?: unknown, config?: any) =>
    (url === TOKEN_URL ? tokenResponse : handler(url, body, config)) as any);

const apiArg = (config: any) => JSON.parse(config.headers['Dropbox-API-Arg']);

beforeEach(() => { configure(); dropbox.resetTokenCache(); });
afterEach(() => {
  delete process.env.DROPBOX_APP_KEY;
  delete process.env.DROPBOX_APP_SECRET;
  delete process.env.DROPBOX_REFRESH_TOKEN;
  jest.restoreAllMocks();
});

describe('configuration', () => {
  it('se dit configuré avec les trois variables', () => {
    expect(dropbox.isConfigured()).toBe(true);
  });

  it.each(['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN'])('se dit non configuré sans %s', name => {
    delete process.env[name];
    expect(dropbox.isConfigured()).toBe(false);
  });
});

describe('jeton', () => {
  it('échange le refresh token puis réutilise le jeton court', async () => {
    const spy = jest.spyOn(axios, 'post').mockResolvedValue(tokenResponse as any);
    expect(await dropbox.getAccessToken()).toBe('short');
    expect(await dropbox.getAccessToken()).toBe('short');

    expect(spy).toHaveBeenCalledTimes(1);
    const body = new URLSearchParams(spy.mock.calls[0][1] as string);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'refresh_token', refresh_token: 'refresh', client_id: 'key', client_secret: 'secret',
    });
  });

  it('en redemande un quand il va expirer', async () => {
    const spy = jest.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'short', expires_in: 30 } } as any);
    await dropbox.getAccessToken();
    await dropbox.getAccessToken();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('uploadFile', () => {
  it('envoie un fichier de 20 Mio en trois morceaux puis le valide', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dbx-')), 'big.zip');
    fs.writeFileSync(file, Buffer.alloc(20 * 1024 * 1024, 1));
    const calls: { url: string; size: number; arg: any; auth: string }[] = [];
    mockPost((url, body, config) => {
      calls.push({ url, size: (body as Buffer).length, arg: apiArg(config), auth: config.headers.Authorization });
      return { data: url.endsWith('/start') ? { session_id: 'S' } : {} };
    });

    await dropbox.uploadFile(file, '/dexvault_2026-09-24.zip');

    expect(calls.map(c => [c.url.replace(CONTENT, ''), c.size])).toEqual([
      ['/upload_session/start', CHUNK_SIZE],
      ['/upload_session/append_v2', CHUNK_SIZE],
      ['/upload_session/append_v2', 4 * 1024 * 1024],
      ['/upload_session/finish', 0],
    ]);
    expect(calls[1].arg).toEqual({ cursor: { session_id: 'S', offset: CHUNK_SIZE }, close: false });
    expect(calls[2].arg).toEqual({ cursor: { session_id: 'S', offset: 2 * CHUNK_SIZE }, close: false });
    expect(calls[3].arg).toEqual({
      cursor: { session_id: 'S', offset: 20 * 1024 * 1024 },
      commit: { path: '/dexvault_2026-09-24.zip', mode: 'overwrite', autorename: false, mute: true },
    });
    expect(calls.every(c => c.auth === 'Bearer short')).toBe(true);
  });

  it('transforme une erreur Dropbox en message lisible', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dbx-')), 'small.zip');
    fs.writeFileSync(file, 'x');
    mockPost(() => {
      throw { isAxiosError: true, response: { status: 409, data: { error_summary: 'path/insufficient_space/..' } } };
    });

    await expect(dropbox.uploadFile(file, '/a.zip'))
      .rejects.toThrow('Dropbox 409: path/insufficient_space/..');
  });
});

describe('listFiles et deleteFile', () => {
  it('suit la pagination, ne garde que les fichiers et renvoie leur taille', async () => {
    const spy = mockPost(url => ({
      data: url.endsWith('/list_folder')
        ? { entries: [{ '.tag': 'file', name: 'a.zip', size: 10 }, { '.tag': 'folder', name: 'sub' }], cursor: 'C', has_more: true }
        : { entries: [{ '.tag': 'file', name: 'b.zip', size: 20 }], cursor: 'D', has_more: false },
    }));

    expect(await dropbox.listFiles('')).toEqual([{ name: 'a.zip', size: 10 }, { name: 'b.zip', size: 20 }]);
    expect(spy).toHaveBeenCalledWith(`${API}/list_folder`, { path: '' }, expect.anything());
    expect(spy).toHaveBeenCalledWith(`${API}/list_folder/continue`, { cursor: 'C' }, expect.anything());
  });

  it('supprime par chemin', async () => {
    const spy = mockPost(() => ({ data: {} }));
    await dropbox.deleteFile('/old.zip');
    expect(spy).toHaveBeenCalledWith(`${API}/delete_v2`, { path: '/old.zip' }, expect.anything());
  });
});
