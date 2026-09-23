import fs from 'fs';
import axios from 'axios';

const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API = 'https://api.dropboxapi.com/2/files';
const CONTENT = 'https://content.dropboxapi.com/2/files';

// A single upload call is capped at 150 MB; sessions of 8 MiB chunks have no such limit.
export const CHUNK_SIZE = 8 * 1024 * 1024;

let cachedToken: { value: string; expiresAt: number } | null = null;

const isConfigured = (): boolean =>
  Boolean(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN);

// Dropbox explains every failure in error_summary ("path/insufficient_space/.."): keep it in the
// message, it is what the Backup page will show.
const toDropboxError = (error: unknown): Error => {
  const response = (error as { response?: { status?: number; data?: { error_summary?: string; error_description?: string } } }).response;
  if (!response) return error instanceof Error ? error : new Error(String(error));
  const detail = response.data?.error_summary || response.data?.error_description || 'unknown error';
  return new Error(`Dropbox ${response.status}: ${detail}`);
};

const getAccessToken = async (): Promise<string> => {
  // Renew a minute early so a token never expires in the middle of an upload.
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.DROPBOX_REFRESH_TOKEN || '',
    client_id: process.env.DROPBOX_APP_KEY || '',
    client_secret: process.env.DROPBOX_APP_SECRET || '',
  }).toString();
  try {
    const { data } = await axios.post(TOKEN_URL, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    });
    cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cachedToken.value;
  } catch (error) {
    throw toDropboxError(error);
  }
};

const rpc = async <T>(endpoint: string, args: unknown): Promise<T> => {
  const token = await getAccessToken();
  try {
    const { data } = await axios.post(`${API}/${endpoint}`, args, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    return data as T;
  } catch (error) {
    throw toDropboxError(error);
  }
};

const content = async <T>(endpoint: string, arg: unknown, chunk: Buffer): Promise<T> => {
  const token = await getAccessToken();
  try {
    const { data } = await axios.post(`${CONTENT}/${endpoint}`, chunk, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify(arg),
      },
      maxBodyLength: Infinity,
      timeout: 5 * 60 * 1000,
    });
    return data as T;
  } catch (error) {
    throw toDropboxError(error);
  }
};

const uploadFile = async (localPath: string, remotePath: string): Promise<void> => {
  const handle = await fs.promises.open(localPath, 'r');
  try {
    const { size } = await handle.stat();
    const readChunk = async (offset: number): Promise<Buffer> => {
      const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, size - offset));
      await handle.read(buffer, 0, buffer.length, offset);
      return buffer;
    };

    let offset = 0;
    const first = await readChunk(0);
    const { session_id } = await content<{ session_id: string }>('upload_session/start', { close: false }, first);
    offset += first.length;

    while (offset < size) {
      const chunk = await readChunk(offset);
      await content('upload_session/append_v2', { cursor: { session_id, offset }, close: false }, chunk);
      offset += chunk.length;
    }

    await content('upload_session/finish', {
      cursor: { session_id, offset },
      commit: { path: remotePath, mode: 'overwrite', autorename: false, mute: true },
    }, Buffer.alloc(0));
  } finally {
    await handle.close();
  }
};

interface ListFolderResult {
  entries: { '.tag': string; name: string; size?: number }[];
  cursor: string;
  has_more: boolean;
}

const listFiles = async (folder: string): Promise<{ name: string; size: number }[]> => {
  const asFiles = (entries: ListFolderResult['entries']) =>
    entries.filter(e => e['.tag'] === 'file').map(e => ({ name: e.name, size: e.size ?? 0 }));

  let page = await rpc<ListFolderResult>('list_folder', { path: folder });
  const files = asFiles(page.entries);
  while (page.has_more) {
    page = await rpc<ListFolderResult>('list_folder/continue', { cursor: page.cursor });
    files.push(...asFiles(page.entries));
  }
  return files;
};

const deleteFile = async (remotePath: string): Promise<void> => {
  await rpc('delete_v2', { path: remotePath });
};

const resetTokenCache = (): void => { cachedToken = null; };

export default { isConfigured, getAccessToken, uploadFile, listFiles, deleteFile, resetTokenCache };
