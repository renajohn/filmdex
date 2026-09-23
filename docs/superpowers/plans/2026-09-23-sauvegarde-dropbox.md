# Sauvegarde nocturne sur Dropbox — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque nuit à 3 h (Zurich), DexVault envoie une sauvegarde complète sur Dropbox, garde les 7
plus récentes et affiche l'état de la dernière exécution sur la page Backup.

**Architecture:** Trois modules backend : `backupService` produit un zip cohérent (snapshot
`VACUUM INTO`), `dropboxService` parle à l'API HTTP de Dropbox, `nightlyBackupService` enchaîne
sauvegarde, envoi, rotation, état et planification. Deux routes exposent l'état et le déclenchement
manuel ; un composant `DropboxBackupCard` les affiche en tête de la page Backup.

**Tech Stack:** Express 5, sqlite3, archiver, axios (client HTTP déjà utilisé par le backend), Jest +
ts-jest + supertest ; React 19, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-sauvegarde-dropbox-design.md`

**Écart assumé avec la spec :** la spec parle de `fetch`. Le backend utilise partout `axios` et ses
tests le simulent par `jest.spyOn(axios, …)` ; on suit ce modèle. L'esprit (« sans SDK Dropbox ») est
respecté.

## Global Constraints

- Variables d'environnement : `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` ; sans
  l'une d'elles, rien n'est planifié et l'état dit `configured: false`.
- Heure d'exécution : 3 h locale, `TZ=Europe/Zurich` dans le compose.
- Nom distant : `/dexvault_<AAAA-MM-JJ>.zip` à la racine du dossier de l'app, date **locale**.
- Rotation : garder les **7** fichiers `dexvault_*.zip` les plus récents par nom, seulement après un
  envoi réussi ; ne jamais toucher un fichier qui ne suit pas le motif.
- Morceaux d'envoi : **8 Mio** (`8 * 1024 * 1024`).
- État : `<data>/backups/dropbox-status.json`.
- Rattrapage : au démarrage, si aucune réussite ou réussite de plus de 24 h, exécution après 5 min.
- Alerte d'interface : dernière réussite absente ou de plus de 48 h.
- Textes d'interface en anglais (comme la page Backup) ; noms de tests en français (comme les tests
  existants).
- Commits : message en anglais, à l'impératif, **sans ligne `Co-Authored-By`**.

## Review Focus

1. **Zip local qui reste sur le disque** quand l'envoi échoue : il doit être supprimé dans tous les cas
   (sinon le volume se remplit d'un zip par nuit d'échec). → test dans la tâche 3.
2. **Clic « Back up now » pendant l'exécution nocturne** : doit répondre 409 sans lancer une seconde
   sauvegarde ni corrompre l'état. → tests dans les tâches 3 et 5.
3. **Nuits de changement d'heure** : la prochaine exécution doit tomber une seule fois, à 3 h locale.
   → tests dans la tâche 4.
4. **Dossier Dropbox contenant d'autres fichiers** (un zip téléversé à la main, `notes.txt`) : jamais
   supprimés par la rotation. → test dans la tâche 3.
5. **Snapshot temporaire laissé derrière** quand l'archivage échoue : `.snapshot-*.sqlite` doit
   disparaître aussi en cas d'erreur. → test dans la tâche 1.

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `backend/src/services/backupService.ts` (modifié) | snapshot cohérent de la base avant zippage |
| `backend/src/services/dropboxService.ts` (nouveau) | jeton, envoi par morceaux, liste, suppression |
| `backend/src/services/nightlyBackupService.ts` (nouveau) | rotation, exécution, état, planification |
| `backend/src/controllers/dropboxBackupController.ts` (nouveau) | deux routes |
| `backend/index.ts` (modifié) | déclaration des routes, démarrage de la planification |
| `backend/tests/setup.js` (modifié) | efface les variables Dropbox du shell du développeur |
| `backend/tests/backup/*.test.ts` (nouveaux) | tests backend |
| `frontend/src/services/backupService.ts` (modifié) | `getDropboxStatus`, `runDropboxBackup` |
| `frontend/src/components/DropboxBackupCard.tsx` (+ `.test.tsx`) (nouveaux) | encart d'état |
| `frontend/src/pages/BackupPage.tsx` (modifié) | insère l'encart |
| `scripts/dropbox-auth.js` (nouveau) | obtention unique du refresh token |
| `docker-compose.yml`, `README.md` (modifiés) | variables, `TZ`, procédure |

Commandes de test :

- backend, un fichier : `cd backend && npx jest tests/backup/<fichier> `
- backend, tout : `cd backend && npm test`
- frontend, un fichier : `cd frontend && npx vitest --run DropboxBackupCard`
- types : `make typecheck` depuis la racine

---

### Task 1: Snapshot cohérent de la base dans `createBackup`

**Files:**
- Modify: `backend/src/services/backupService.ts` (imports ; `createBackup`, lignes 50-133)
- Test: `backend/tests/backup/createBackup.test.ts`

**Interfaces:**
- Consumes: `getDatabase()` de `backend/src/database.ts`
- Produces: `backupService.snapshotDatabase(): Promise<string>` (chemin du snapshot) ;
  `backupService.createBackup(): Promise<BackupResult>` inchangé en signature
  (`{ filename, path, size, sizeMB }`), utilisé par la tâche 3.

- [ ] **Step 1: Écrire les tests qui échouent**

`backend/tests/backup/createBackup.test.ts` :

```ts
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

  it('supprime le snapshot même quand l’archivage échoue', async () => {
    const archiveSpy = jest.spyOn(backupService, 'writeArchive').mockRejectedValue(new Error('disque plein'));

    await expect(backupService.createBackup()).rejects.toThrow('disque plein');
    expect(archiveSpy).toHaveBeenCalled();
    expect(snapshots()).toEqual([]);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `cd backend && npx jest tests/backup/createBackup.test.ts`
Expected: FAIL. Le premier par « Database file not found » (la base de test est `:memory:`, le fichier
n'existe pas) ; le second parce que `writeArchive` n'existe pas.

- [ ] **Step 3: Implémenter**

Dans `backend/src/services/backupService.ts`, ajouter l'import :

```ts
import { getDatabase } from '../database';
```

Remplacer toute la méthode `createBackup` (de `// Create a backup zip file` jusqu'à la fin de la
méthode, avant `// Get list of available backups`) par :

```ts
  // Copy the live database through SQLite itself: zipping db.sqlite while the
  // server writes to it can capture a half-written page.
  async snapshotDatabase(): Promise<string> {
    const snapshotPath = path.join(this.getBackupDir(), `.snapshot-${Date.now()}.sqlite`);
    await new Promise<void>((resolve, reject) =>
      getDatabase().run('VACUUM INTO ?', [snapshotPath], (err: Error | null) => (err ? reject(err) : resolve())));
    return snapshotPath;
  },

  // Create a backup zip file
  async createBackup(): Promise<BackupResult> {
    const snapshotPath = await this.snapshotDatabase();
    try {
      return await this.writeArchive(snapshotPath);
    } finally {
      fs.rmSync(snapshotPath, { force: true });
    }
  },

  // Zip the database snapshot with the images and ebooks directories
  writeArchive(dbSnapshotPath: string): Promise<BackupResult> {
    return new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' +
                      new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      const backupFilename = `backup_${timestamp}.zip`;
      const backupPath = path.join(this.getBackupDir(), backupFilename);
      const imagesPath = configManager.getImagesPath();
      const ebooksPath = configManager.getEbooksPath();

      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        logger.info(`Backup created: ${backupFilename} (${sizeMB} MB)`);
        resolve({
          filename: backupFilename,
          path: backupPath,
          size: archive.pointer(),
          sizeMB: parseFloat(sizeMB)
        });
      });

      // Catch warnings (e.g. stat failures and other non-blocking errors)
      archive.on('warning', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          logger.warn('Archive warning:', err);
        } else {
          reject(err);
        }
      });
      archive.on('error', (err: Error) => reject(err));

      archive.pipe(output);
      archive.file(dbSnapshotPath, { name: 'db.sqlite' });

      if (fs.existsSync(imagesPath)) {
        archive.directory(imagesPath, 'images');
      }
      if (fs.existsSync(ebooksPath)) {
        archive.directory(ebooksPath, 'ebooks');
      }

      archive.finalize();
    });
  },
```

Si `VACUUM INTO ?` refuse le paramètre lié (erreur SQLite à l'exécution), remplacer par
`` `VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'` `` sans paramètres ; le chemin est construit par
nous, pas par l'utilisateur.

`configManager.getDatabasePath()` n'est plus utilisé dans `createBackup` : ne pas le supprimer ailleurs
(`restoreBackup` s'en sert).

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd backend && npx jest tests/backup/createBackup.test.ts`
Expected: PASS (2 tests).

Puis la suite complète, pour la restauration qui appelle `createBackup` :
Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/backupService.ts backend/tests/backup/createBackup.test.ts
git commit -m "Snapshot the database with VACUUM INTO before zipping a backup"
```

---

### Task 2: Client Dropbox

**Files:**
- Create: `backend/src/services/dropboxService.ts`
- Modify: `backend/tests/setup.js` (après `delete process.env.DOES_DOG_DIE;`)
- Test: `backend/tests/backup/dropboxService.test.ts`

**Interfaces:**
- Produces (export default `dropboxService`) :
  - `isConfigured(): boolean`
  - `getAccessToken(): Promise<string>`
  - `uploadFile(localPath: string, remotePath: string): Promise<void>`
  - `listFiles(folder: string): Promise<string[]>` — noms des **fichiers** (pas dossiers)
  - `deleteFile(remotePath: string): Promise<void>`
  - `resetTokenCache(): void` (tests)
- Produces (export nommé) : `CHUNK_SIZE = 8 * 1024 * 1024`

- [ ] **Step 1: Effacer les variables Dropbox dans l'environnement de test**

Dans `backend/tests/setup.js`, juste après `delete process.env.DOES_DOG_DIE;` :

```js
delete process.env.DROPBOX_APP_KEY;
delete process.env.DROPBOX_APP_SECRET;
delete process.env.DROPBOX_REFRESH_TOKEN;
```

- [ ] **Step 2: Écrire les tests qui échouent**

`backend/tests/backup/dropboxService.test.ts` :

```ts
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
  it('suit la pagination et ne garde que les fichiers', async () => {
    const spy = mockPost(url => ({
      data: url.endsWith('/list_folder')
        ? { entries: [{ '.tag': 'file', name: 'a.zip' }, { '.tag': 'folder', name: 'sub' }], cursor: 'C', has_more: true }
        : { entries: [{ '.tag': 'file', name: 'b.zip' }], cursor: 'D', has_more: false },
    }));

    expect(await dropbox.listFiles('')).toEqual(['a.zip', 'b.zip']);
    expect(spy).toHaveBeenCalledWith(`${API}/list_folder`, { path: '' }, expect.anything());
    expect(spy).toHaveBeenCalledWith(`${API}/list_folder/continue`, { cursor: 'C' }, expect.anything());
  });

  it('supprime par chemin', async () => {
    const spy = mockPost(() => ({ data: {} }));
    await dropbox.deleteFile('/old.zip');
    expect(spy).toHaveBeenCalledWith(`${API}/delete_v2`, { path: '/old.zip' }, expect.anything());
  });
});
```

- [ ] **Step 3: Vérifier qu'ils échouent**

Run: `cd backend && npx jest tests/backup/dropboxService.test.ts`
Expected: FAIL, « Cannot find module '../../src/services/dropboxService' ».

- [ ] **Step 4: Implémenter**

`backend/src/services/dropboxService.ts` :

```ts
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
  entries: { '.tag': string; name: string }[];
  cursor: string;
  has_more: boolean;
}

const listFiles = async (folder: string): Promise<string[]> => {
  let page = await rpc<ListFolderResult>('list_folder', { path: folder });
  const names = page.entries.filter(e => e['.tag'] === 'file').map(e => e.name);
  while (page.has_more) {
    page = await rpc<ListFolderResult>('list_folder/continue', { cursor: page.cursor });
    names.push(...page.entries.filter(e => e['.tag'] === 'file').map(e => e.name));
  }
  return names;
};

const deleteFile = async (remotePath: string): Promise<void> => {
  await rpc('delete_v2', { path: remotePath });
};

const resetTokenCache = (): void => { cachedToken = null; };

export default { isConfigured, getAccessToken, uploadFile, listFiles, deleteFile, resetTokenCache };
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `cd backend && npx jest tests/backup/dropboxService.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/dropboxService.ts backend/tests/backup/dropboxService.test.ts backend/tests/setup.js
git commit -m "Add a Dropbox client for chunked uploads, listing and deletion"
```

---

### Task 3: Exécution d'une sauvegarde : envoi, rotation, état

**Files:**
- Create: `backend/src/services/nightlyBackupService.ts`
- Test: `backend/tests/backup/nightlyBackupRun.test.ts`

**Interfaces:**
- Consumes: `backupService.createBackup()` et `backupService.getBackupDir()` (tâche 1) ;
  `dropboxService.uploadFile/listFiles/deleteFile/isConfigured` (tâche 2).
- Produces (dans `nightlyBackupService.ts`) :
  - `export const KEEP = 7`
  - `export interface BackupStatus { lastSuccessAt: string | null; lastSuccessFile: string | null; lastSuccessSize: number | null; lastErrorAt: string | null; lastError: string | null; lastWarning: string | null }`
  - `export class BackupAlreadyRunningError extends Error`
  - `export const remoteName = (now: Date): string` → `dexvault_AAAA-MM-JJ.zip` (date locale)
  - `export const pickToDelete = (names: string[], keep = KEEP): string[]`
  - default export `nightlyBackupService` avec `readStatus(): BackupStatus`,
    `isRunning(): boolean`, `runOnce(now?: Date): Promise<{ ok: boolean; status: BackupStatus }>`.
    `runOnce` rejette `BackupAlreadyRunningError` si une exécution est en cours ; sinon il ne rejette
    jamais : un échec est consigné dans l'état et renvoyé avec `ok: false`.
  - La tâche 4 ajoute `nextRunAt`, `msUntilNext`, `isStale`, `startNightlyBackup` au même module.

- [ ] **Step 1: Écrire les tests qui échouent**

`backend/tests/backup/nightlyBackupRun.test.ts` :

```ts
import fs from 'fs';
import path from 'path';
import backupService from '../../src/services/backupService';
import dropbox from '../../src/services/dropboxService';
import nightly, { BackupAlreadyRunningError, pickToDelete, remoteName } from '../../src/services/nightlyBackupService';

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

describe('pickToDelete', () => {
  it('garde les 7 plus récents et ignore les fichiers étrangers', () => {
    const days = ['16', '17', '18', '19', '20', '21', '22', '23', '24'].map(d => `dexvault_2026-09-${d}.zip`);
    const names = [...days.slice(4), 'notes.txt', 'backup_2026-01-01.zip', ...days.slice(0, 4)];
    expect(pickToDelete(names).sort()).toEqual(['dexvault_2026-09-16.zip', 'dexvault_2026-09-17.zip']);
  });

  it('ne supprime rien quand il y en a 7 ou moins', () => {
    expect(pickToDelete(['dexvault_2026-09-24.zip', 'dexvault_2026-09-23.zip'])).toEqual([]);
  });
});

describe('runOnce', () => {
  it('envoie, fait tourner, écrit l’état et supprime le zip local', async () => {
    const zip = fakeZip();
    const upload = jest.spyOn(dropbox, 'uploadFile').mockResolvedValue();
    const existing = ['16', '17', '18', '19', '20', '21', '22', '23', '24'].map(d => `dexvault_2026-09-${d}.zip`);
    jest.spyOn(dropbox, 'listFiles').mockResolvedValue([...existing, 'notes.txt']);
    const del = jest.spyOn(dropbox, 'deleteFile').mockResolvedValue();

    const { ok, status } = await nightly.runOnce(NOW);

    expect(ok).toBe(true);
    expect(upload).toHaveBeenCalledWith(zip, '/dexvault_2026-09-24.zip');
    expect(del.mock.calls.map(c => c[0]).sort()).toEqual(['/dexvault_2026-09-16.zip', '/dexvault_2026-09-17.zip']);
    expect(status).toMatchObject({
      lastSuccessAt: NOW.toISOString(), lastSuccessFile: 'dexvault_2026-09-24.zip', lastSuccessSize: 3,
      lastError: null, lastErrorAt: null, lastWarning: null,
    });
    expect(nightly.readStatus()).toEqual(status);
    expect(fs.existsSync(zip)).toBe(false);
  });

  it('ne supprime rien et consigne l’erreur si l’envoi échoue', async () => {
    const zip = fakeZip();
    jest.spyOn(dropbox, 'uploadFile').mockRejectedValue(new Error('Dropbox 409: path/insufficient_space/..'));
    const list = jest.spyOn(dropbox, 'listFiles');
    const del = jest.spyOn(dropbox, 'deleteFile');

    const { ok, status } = await nightly.runOnce(NOW);

    expect(ok).toBe(false);
    expect(list).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(status).toMatchObject({ lastErrorAt: NOW.toISOString(), lastError: 'Dropbox 409: path/insufficient_space/..' });
    expect(fs.existsSync(zip)).toBe(false);
  });

  it('garde la dernière réussite quand une exécution suivante échoue', async () => {
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

  it('compte comme réussie une exécution dont seule la rotation échoue', async () => {
    fakeZip();
    jest.spyOn(dropbox, 'uploadFile').mockResolvedValue();
    jest.spyOn(dropbox, 'listFiles').mockRejectedValue(new Error('Dropbox 500: internal'));

    const { ok, status } = await nightly.runOnce(NOW);

    expect(ok).toBe(true);
    expect(status).toMatchObject({ lastSuccessAt: NOW.toISOString(), lastError: null, lastWarning: 'Rotation failed: Dropbox 500: internal' });
  });

  it('refuse une seconde exécution concurrente', async () => {
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

  it('renvoie un état vide avant toute exécution', () => {
    expect(nightly.readStatus()).toEqual({
      lastSuccessAt: null, lastSuccessFile: null, lastSuccessSize: null,
      lastErrorAt: null, lastError: null, lastWarning: null,
    });
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `cd backend && npx jest tests/backup/nightlyBackupRun.test.ts`
Expected: FAIL, « Cannot find module '../../src/services/nightlyBackupService' ».

- [ ] **Step 3: Implémenter**

`backend/src/services/nightlyBackupService.ts` :

```ts
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

const statusPath = () => path.join(backupService.getBackupDir(), 'dropbox-status.json');

let running = false;

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
      nightlyBackupService.writeStatus(status);
      logger.info(`Dropbox backup uploaded: ${name} (${backup.sizeMB} MB)`);
      return { ok: true, status };
    } catch (error) {
      const message = (error as Error).message || String(error);
      const status: BackupStatus = { ...previous, lastErrorAt: now.toISOString(), lastError: message };
      nightlyBackupService.writeStatus(status);
      logger.error(`Dropbox backup failed: ${message}`);
      return { ok: false, status };
    } finally {
      // On the same volume as the database, the local zip protects from nothing.
      if (localZip) fs.rmSync(localZip, { force: true });
      running = false;
    }
  },
};

export default nightlyBackupService;
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd backend && npx jest tests/backup/nightlyBackupRun.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/nightlyBackupService.ts backend/tests/backup/nightlyBackupRun.test.ts
git commit -m "Upload a backup to Dropbox, keep the seven latest and record the outcome"
```

---

### Task 4: Planification à 3 h et rattrapage

**Files:**
- Modify: `backend/src/services/nightlyBackupService.ts`
- Modify: `backend/index.ts` (import en tête ; ligne ~476, après `warningsService.startDailyRefresh();`)
- Test: `backend/tests/backup/nightlyBackupSchedule.test.ts`

**Interfaces:**
- Consumes: `nightlyBackupService.runOnce`, `readStatus` (tâche 3) ; `dropbox.isConfigured` (tâche 2).
- Produces (exports nommés du même module) :
  - `export const BACKUP_HOUR = 3`
  - `export const nextRunAt = (hour: number, now: Date): Date`
  - `export const msUntilNext = (hour: number, now: Date): number`
  - `export const isStale = (status: BackupStatus, now: Date, maxAgeMs: number): boolean`
  - `export const startNightlyBackup = (): void`
  - La tâche 5 utilise `nextRunAt(BACKUP_HOUR, new Date())`.

- [ ] **Step 1: Écrire les tests qui échouent**

`backend/tests/backup/nightlyBackupSchedule.test.ts` :

```ts
// Must be set before any Date is built: the schedule is computed in local time.
process.env.TZ = 'Europe/Zurich';

import { BACKUP_HOUR, isStale, msUntilNext, nextRunAt } from '../../src/services/nightlyBackupService';

const DAY = 24 * 3600 * 1000;
const at = (iso: string) => new Date(iso);

// Jest may reuse this worker for other files: give them back their time zone.
const previousTz = process.env.TZ;
afterAll(() => { if (previousTz === undefined) delete process.env.TZ; else process.env.TZ = previousTz; });

describe('nextRunAt', () => {
  it('prend 3 h le jour même quand il n’est pas encore 3 h', () => {
    expect(nextRunAt(BACKUP_HOUR, at('2026-09-23T22:30:00Z')).toISOString()).toBe('2026-09-24T01:00:00.000Z');
  });

  it('prend le lendemain quand 3 h est passé ou atteint', () => {
    expect(nextRunAt(BACKUP_HOUR, at('2026-09-24T01:00:00Z')).toISOString()).toBe('2026-09-25T01:00:00.000Z');
    expect(nextRunAt(BACKUP_HOUR, at('2026-09-24T10:00:00Z')).toISOString()).toBe('2026-09-25T01:00:00.000Z');
  });

  it('tombe une fois à 3 h la nuit du passage à l’heure d’été', () => {
    // 29 mars 2026 : 2 h CET devient 3 h CEST ; 3 h CEST = 01:00Z.
    expect(nextRunAt(BACKUP_HOUR, at('2026-03-28T23:30:00Z')).toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('tombe une fois à 3 h la nuit du retour à l’heure d’hiver', () => {
    // 25 octobre 2026 : 3 h CEST redevient 2 h CET ; 3 h CET = 02:00Z.
    expect(nextRunAt(BACKUP_HOUR, at('2026-10-24T22:30:00Z')).toISOString()).toBe('2026-10-25T02:00:00.000Z');
  });

  it('garde 3 h le lendemain d’un changement d’heure', () => {
    expect(nextRunAt(BACKUP_HOUR, at('2026-10-25T02:00:00Z')).toISOString()).toBe('2026-10-26T02:00:00.000Z');
  });
});

describe('msUntilNext', () => {
  it('donne le délai jusqu’à la prochaine exécution', () => {
    expect(msUntilNext(BACKUP_HOUR, at('2026-09-23T22:30:00Z'))).toBe(2.5 * 3600 * 1000);
  });
});

describe('isStale', () => {
  const status = (lastSuccessAt: string | null) => ({
    lastSuccessAt, lastSuccessFile: null, lastSuccessSize: null, lastErrorAt: null, lastError: null, lastWarning: null,
  });

  it('est vrai sans aucune réussite', () => {
    expect(isStale(status(null), at('2026-09-24T12:00:00Z'), DAY)).toBe(true);
  });

  it('compare l’âge de la dernière réussite au seuil', () => {
    expect(isStale(status('2026-09-24T01:00:00Z'), at('2026-09-24T12:00:00Z'), DAY)).toBe(false);
    expect(isStale(status('2026-09-22T01:00:00Z'), at('2026-09-24T12:00:00Z'), DAY)).toBe(true);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `cd backend && npx jest tests/backup/nightlyBackupSchedule.test.ts`
Expected: FAIL, `nextRunAt is not a function` (ou erreur TypeScript d'export manquant).

- [ ] **Step 3: Implémenter**

Dans `backend/src/services/nightlyBackupService.ts`, avant `const statusPath = …`, ajouter :

```ts
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
```

À la fin du fichier, après `export default nightlyBackupService;`, ajouter :

```ts
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
```

Dans `backend/index.ts`, ajouter l'import à côté de celui de `warningsService` :

```ts
import { startNightlyBackup } from './src/services/nightlyBackupService';
```

et, juste après `warningsService.startDailyRefresh();` :

```ts
    startNightlyBackup();
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd backend && npx jest tests/backup/`
Expected: PASS (toutes les suites `tests/backup`).

Run: `cd backend && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/nightlyBackupService.ts backend/tests/backup/nightlyBackupSchedule.test.ts backend/index.ts
git commit -m "Schedule the Dropbox backup at 3 a.m. and catch up after downtime"
```

---

### Task 5: Routes d'état et de déclenchement

**Files:**
- Create: `backend/src/controllers/dropboxBackupController.ts`
- Modify: `backend/index.ts` (import ; routes juste avant `app.delete('/api/backup/:filename', …)`, ligne ~330)
- Test: `backend/tests/backup/dropboxBackupRoutes.test.ts`

**Interfaces:**
- Consumes: `nightlyBackupService.readStatus/isRunning/runOnce`, `BackupAlreadyRunningError`,
  `nextRunAt`, `BACKUP_HOUR` (tâches 3-4) ; `dropbox.isConfigured` (tâche 2).
- Produces (HTTP, utilisé par la tâche 6) :
  - `GET /api/backup/dropbox/status` → 200
    `{ configured: boolean, running: boolean, nextRunAt: string | null, lastSuccessAt, lastSuccessFile, lastSuccessSize, lastErrorAt, lastError, lastWarning }`
  - `POST /api/backup/dropbox/run` → 200 `{ ok: boolean, status: DropboxStatus }` (même forme que GET
    pour `status`) ; 400 `{ error }` si non configuré ; 409 `{ error }` si une exécution est en cours.

- [ ] **Step 1: Écrire les tests qui échouent**

`backend/tests/backup/dropboxBackupRoutes.test.ts` :

```ts
import request from 'supertest';
import app from '../../index';
import nightly, { BackupAlreadyRunningError } from '../../src/services/nightlyBackupService';

const EMPTY = {
  lastSuccessAt: null, lastSuccessFile: null, lastSuccessSize: null, lastErrorAt: null, lastError: null, lastWarning: null,
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
    expect(res.body).toEqual({ configured: false, running: false, nextRunAt: null, ...EMPTY });
  });

  it('donne l’état et la prochaine exécution une fois configuré', async () => {
    configure();
    const saved = { ...EMPTY, lastSuccessAt: '2026-09-24T01:00:00.000Z', lastSuccessFile: 'dexvault_2026-09-24.zip', lastSuccessSize: 3 };
    jest.spyOn(nightly, 'readStatus').mockReturnValue(saved);
    const res = await request(app).get('/api/backup/dropbox/status');
    expect(res.body).toMatchObject({ configured: true, running: false, ...saved });
    expect(new Date(res.body.nextRunAt).getTime()).toBeGreaterThan(Date.now());
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

  it('renvoie le résultat de l’exécution, même en échec', async () => {
    configure();
    const failed = { ...EMPTY, lastErrorAt: '2026-09-24T01:00:00.000Z', lastError: 'Dropbox 401: expired' };
    jest.spyOn(nightly, 'runOnce').mockResolvedValue({ ok: false, status: failed });
    jest.spyOn(nightly, 'readStatus').mockReturnValue(failed);
    const res = await request(app).post('/api/backup/dropbox/run');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, status: { configured: true, lastError: 'Dropbox 401: expired' } });
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `cd backend && npx jest tests/backup/dropboxBackupRoutes.test.ts`
Expected: FAIL, 404 sur les deux routes.

- [ ] **Step 3: Implémenter**

`backend/src/controllers/dropboxBackupController.ts` :

```ts
import { Request, Response } from 'express';
import dropbox from '../services/dropboxService';
import nightly, { BackupAlreadyRunningError, BACKUP_HOUR, nextRunAt } from '../services/nightlyBackupService';

const currentStatus = () => {
  const configured = dropbox.isConfigured();
  return {
    configured,
    running: nightly.isRunning(),
    nextRunAt: configured ? nextRunAt(BACKUP_HOUR, new Date()).toISOString() : null,
    ...nightly.readStatus(),
  };
};

const dropboxBackupController = {
  getStatus(req: Request, res: Response): void {
    res.json(currentStatus());
  },

  // Waits for the upload: the button on the Backup page shows the outcome right away.
  async run(req: Request, res: Response): Promise<void> {
    if (!dropbox.isConfigured()) {
      res.status(400).json({ error: 'Dropbox backup is not configured' });
      return;
    }
    try {
      const { ok } = await nightly.runOnce();
      res.json({ ok, status: currentStatus() });
    } catch (error) {
      if (error instanceof BackupAlreadyRunningError) {
        res.status(409).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: (error as Error).message });
    }
  },
};

export default dropboxBackupController;
```

Dans `backend/index.ts`, importer le contrôleur à côté de `backupController` :

```ts
import dropboxBackupController from './src/controllers/dropboxBackupController';
```

et déclarer les routes juste **avant** `app.delete('/api/backup/:filename', …)` :

```ts
app.get('/api/backup/dropbox/status', dropboxBackupController.getStatus);
app.post('/api/backup/dropbox/run', dropboxBackupController.run);
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd backend && npx jest tests/backup/`
Expected: PASS.

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: PASS, aucune erreur de type.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/dropboxBackupController.ts backend/index.ts backend/tests/backup/dropboxBackupRoutes.test.ts
git commit -m "Expose the Dropbox backup status and a manual trigger"
```

---

### Task 6: Encart « Dropbox backup » sur la page Backup

**Files:**
- Modify: `frontend/src/services/backupService.ts` (nouvelles méthodes dans la classe `BackupService`)
- Create: `frontend/src/components/DropboxBackupCard.tsx`
- Create: `frontend/src/components/DropboxBackupCard.test.tsx`
- Modify: `frontend/src/pages/BackupPage.tsx` (import ; insertion avant `<div className="backup-actions">`)
- Modify: `frontend/src/pages/BackupPage.css` (styles de l'encart)

**Interfaces:**
- Consumes: routes de la tâche 5.
- Produces:
  - `export interface DropboxStatus { configured: boolean; running: boolean; nextRunAt: string | null; lastSuccessAt: string | null; lastSuccessFile: string | null; lastSuccessSize: number | null; lastErrorAt: string | null; lastError: string | null; lastWarning: string | null }` dans `frontend/src/services/backupService.ts`
  - `backupService.getDropboxStatus(): Promise<DropboxStatus>`
  - `backupService.runDropboxBackup(): Promise<{ ok: boolean; status: DropboxStatus }>` (rejette sur 400/409/500 avec le message `error` du serveur)
  - composant `DropboxBackupCard` (export default, sans props) ; export nommé `formatAge(ms: number): string`

- [ ] **Step 1: Écrire les tests qui échouent**

`frontend/src/components/DropboxBackupCard.test.tsx` :

```tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DropboxBackupCard, { formatAge } from './DropboxBackupCard';
import backupService, { DropboxStatus } from '../services/backupService';

vi.mock('../services/backupService', () => ({
  default: { getDropboxStatus: vi.fn(), runDropboxBackup: vi.fn() },
}));

const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const status = (over: Partial<DropboxStatus> = {}): DropboxStatus => ({
  configured: true, running: false, nextRunAt: new Date(Date.now() + 10 * HOUR).toISOString(),
  lastSuccessAt: ago(5 * HOUR), lastSuccessFile: 'dexvault_2026-09-24.zip', lastSuccessSize: 68 * 1024 * 1024,
  lastErrorAt: null, lastError: null, lastWarning: null, ...over,
});

const show = async (s: DropboxStatus) => {
  vi.mocked(backupService.getDropboxStatus).mockResolvedValue(s);
  render(<DropboxBackupCard />);
  await screen.findByText('Dropbox backup');
};

afterEach(() => vi.clearAllMocks());

describe('formatAge', () => {
  it('parle en minutes, puis en heures, puis en jours', () => {
    expect(formatAge(5 * 60 * 1000)).toBe('5 min ago');
    expect(formatAge(5 * HOUR)).toBe('5 h ago');
    expect(formatAge(3 * 24 * HOUR)).toBe('3 days ago');
  });
});

describe('DropboxBackupCard', () => {
  it('explique les variables à définir quand rien n’est configuré', async () => {
    await show(status({ configured: false, nextRunAt: null, lastSuccessAt: null }));
    expect(screen.getByText(/DROPBOX_REFRESH_TOKEN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back up now' })).not.toBeInTheDocument();
  });

  it('affiche la dernière réussite sans alerte quand elle est récente', async () => {
    await show(status());
    expect(screen.getByText(/Last backup: 5 h ago \(68 MB\)/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('affiche l’erreur plus récente que la dernière réussite', async () => {
    await show(status({ lastErrorAt: ago(HOUR), lastError: 'Dropbox 401: expired_access_token' }));
    expect(screen.getByText(/Dropbox 401: expired_access_token/)).toBeInTheDocument();
  });

  it('alerte quand la dernière réussite a plus de 48 h', async () => {
    await show(status({ lastSuccessAt: ago(50 * HOUR) }));
    expect(screen.getByRole('alert')).toHaveTextContent('No successful Dropbox backup in the last 48 hours');
  });

  it('alerte quand aucune sauvegarde n’a jamais réussi', async () => {
    await show(status({ lastSuccessAt: null, lastSuccessFile: null, lastSuccessSize: null }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('désactive le bouton pendant l’exécution puis recharge l’état', async () => {
    let finish: (v: { ok: boolean; status: DropboxStatus }) => void = () => {};
    vi.mocked(backupService.runDropboxBackup).mockImplementation(() => new Promise(r => { finish = r; }));
    await show(status({ lastSuccessAt: ago(50 * HOUR) }));

    const button = screen.getByRole('button', { name: 'Back up now' });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: /Backing up/ })).toBeDisabled();

    finish({ ok: true, status: status() });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('désactive le bouton quand l’exécution nocturne tourne déjà', async () => {
    await show(status({ running: true }));
    expect(screen.getByRole('button', { name: /Backing up/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `cd frontend && npx vitest --run DropboxBackupCard`
Expected: FAIL, « Failed to resolve import "./DropboxBackupCard" ».

- [ ] **Step 3: Implémenter le service**

Dans `frontend/src/services/backupService.ts`, avant `class BackupService {` :

```ts
export interface DropboxStatus {
  configured: boolean;
  running: boolean;
  nextRunAt: string | null;
  lastSuccessAt: string | null;
  lastSuccessFile: string | null;
  lastSuccessSize: number | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastWarning: string | null;
}
```

et dans la classe, après `listBackups` :

```ts
  async getDropboxStatus(): Promise<DropboxStatus> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/dropbox/status`);
    if (!response.ok) {
      throw new Error('Failed to load the Dropbox backup status');
    }
    return await response.json() as DropboxStatus;
  }

  async runDropboxBackup(): Promise<{ ok: boolean; status: DropboxStatus }> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/dropbox/run`, { method: 'POST' });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      throw new Error((data.error as string) || 'Failed to run the Dropbox backup');
    }
    return data as unknown as { ok: boolean; status: DropboxStatus };
  }
```

- [ ] **Step 4: Implémenter le composant**

`frontend/src/components/DropboxBackupCard.tsx` :

```tsx
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
    } catch (err) {
      setRequestError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRun = async () => {
    setBusy(true);
    setRequestError(null);
    try {
      const result = await backupService.runDropboxBackup();
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
          ? `Last backup: ${formatAge(now - lastSuccess)} (${formatSize(status.lastSuccessSize || 0)})`
          : 'No backup uploaded yet.'}
      </p>
      {showError && (
        <p className="text-danger">
          Last error ({new Date(status.lastErrorAt as string).toLocaleString()}): {status.lastError}
        </p>
      )}
      {status.lastWarning && <p className="text-warning">{status.lastWarning}</p>}
      {requestError && <p className="text-danger">{requestError}</p>}
      {status.nextRunAt && <p>Next run: {new Date(status.nextRunAt).toLocaleString()}</p>}

      <button className="btn btn-primary" onClick={handleRun} disabled={running}>
        {running ? 'Backing up…' : 'Back up now'}
      </button>
    </div>
  );
};

export default DropboxBackupCard;
```

Dans `frontend/src/pages/BackupPage.tsx`, importer :

```tsx
import DropboxBackupCard from '../components/DropboxBackupCard';
```

et insérer juste avant `<div className="backup-actions">` :

```tsx
      <DropboxBackupCard />
```

Dans `frontend/src/pages/BackupPage.css`, ajouter en fin de fichier :

```css
.dropbox-card {
  margin-bottom: 1.5rem;
}
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `cd frontend && npx vitest --run DropboxBackupCard`
Expected: PASS (8 tests).

Run: `cd frontend && npx vitest --run && npx tsc --noEmit`
Expected: PASS, aucune erreur de type.

- [ ] **Step 6: Vérifier le rendu**

Lancer `npm run dev` à la racine, ouvrir la page Backup (`http://localhost:3000`, onglet Backup) :
sans variables Dropbox, l'encart affiche le message « not configured ». Faire une capture avec le MCP
Chrome pour vérifier que l'encart s'aligne avec les cartes existantes, en clair et en sombre.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/services/backupService.ts frontend/src/components/DropboxBackupCard.tsx frontend/src/components/DropboxBackupCard.test.tsx frontend/src/pages/BackupPage.tsx frontend/src/pages/BackupPage.css
git commit -m "Show the Dropbox backup status on the Backup page"
```

---

### Task 7: Script d'autorisation, compose et documentation

**Files:**
- Create: `scripts/dropbox-auth.js`
- Modify: `docker-compose.yml` (bloc `environment`)
- Modify: `README.md` (nouvelle section après « Docker Compose », avant « Database Schema »)

**Interfaces:**
- Consumes: noms de variables des tâches 2 et 4.
- Produces: rien pour le code ; procédure pour l'utilisateur.

- [ ] **Step 1: Écrire le script**

`scripts/dropbox-auth.js` :

```js
#!/usr/bin/env node

// One-off helper: turns the app key and secret of a Dropbox app into the long-lived
// refresh token DexVault needs (DROPBOX_REFRESH_TOKEN).
//   node scripts/dropbox-auth.js <app key> <app secret>

const readline = require('readline');

async function main() {
  const [appKey = process.env.DROPBOX_APP_KEY, appSecret = process.env.DROPBOX_APP_SECRET] = process.argv.slice(2);
  if (!appKey || !appSecret) {
    console.error('Usage: node scripts/dropbox-auth.js <app key> <app secret>');
    process.exit(1);
  }

  const url = 'https://www.dropbox.com/oauth2/authorize'
    + `?client_id=${encodeURIComponent(appKey)}&response_type=code&token_access_type=offline`;
  console.log(`1. Open this URL and allow access:\n\n   ${url}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('2. Paste the code Dropbox shows: ', answer => {
    rl.close();
    resolve(answer.trim());
  }));

  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: appKey, client_secret: appSecret }),
  });
  const data = await response.json();
  if (!response.ok || !data.refresh_token) {
    console.error('Dropbox refused the code:', data.error_description || data.error || response.status);
    process.exit(1);
  }
  console.log(`\nDROPBOX_REFRESH_TOKEN=${data.refresh_token}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 2: Vérifier le script sans Dropbox**

Run: `node scripts/dropbox-auth.js`
Expected: « Usage: node scripts/dropbox-auth.js <app key> <app secret> », code de sortie 1.

Run: `printf 'bad\n' | node scripts/dropbox-auth.js fakekey fakesecret`
Expected: affiche l'URL, puis « Dropbox refused the code: … » et code de sortie 1 (nécessite le réseau).

- [ ] **Step 3: Compléter le compose**

Dans `docker-compose.yml`, à la fin du bloc `environment:` du service `dexvault` :

```yaml
      # Nightly backup to Dropbox (see README, "Dropbox backup"). Without these three,
      # nothing is scheduled and the Backup page says so.
      - DROPBOX_APP_KEY=${DROPBOX_APP_KEY:-}
      - DROPBOX_APP_SECRET=${DROPBOX_APP_SECRET:-}
      - DROPBOX_REFRESH_TOKEN=${DROPBOX_REFRESH_TOKEN:-}
      # The backup runs at 3 a.m. local time: without TZ the container runs on UTC.
      - TZ=Europe/Zurich
```

Vérifier que l'image honore `TZ` (Node embarque ses données de fuseaux, l'image Alpine n'a pas tzdata) :

Run: `docker run --rm -e TZ=Europe/Zurich node:20-alpine node -e "console.log(new Date('2026-09-24T01:00:00Z').toString())"`
Expected: `Thu Sep 24 2026 03:00:00 GMT+0200 (Central European Summer Time)`. Si l'heure affichée est
01:00 GMT+0000, ajouter `RUN apk add --no-cache tzdata` à l'étape finale du `Dockerfile` et relancer.

- [ ] **Step 4: Documenter**

Dans `README.md`, avant `## Database Schema`, ajouter :

````markdown
## Dropbox backup

Every night at 3 a.m. (container time, `TZ=Europe/Zurich` in `docker-compose.yml`), DexVault uploads a
full backup (database, images, ebooks) to Dropbox as `dexvault_YYYY-MM-DD.zip` and keeps the seven most
recent. The Backup page shows the last success, the last error and a "Back up now" button.

### Setup (once)

1. On <https://www.dropbox.com/developers/apps>, create an app with **Scoped access** and
   **App folder** access. In *Permissions*, tick `files.content.write`, `files.content.read` and
   `files.metadata.read`, then *Submit*.
2. Copy the *App key* and *App secret* from the *Settings* tab.
3. Run `node scripts/dropbox-auth.js <app key> <app secret>`, open the URL, allow access and paste the
   code. The script prints `DROPBOX_REFRESH_TOKEN=…`.
4. Put the three values in the `.env` next to `docker-compose.yml`:

   ```
   DROPBOX_APP_KEY=…
   DROPBOX_APP_SECRET=…
   DROPBOX_REFRESH_TOKEN=…
   ```

5. `docker compose up -d`, then click **Back up now** on the Backup page to check the setup.

Backups land in `Dropbox/Apps/<app name>/`. Other files in that folder are never deleted.

### Restore

Download a `dexvault_*.zip` from Dropbox, then use **Restore from file** on the Backup page. On a new
server, start DexVault with an empty volume first, then restore.
````

- [ ] **Step 5: Vérifier l'ensemble**

Run: `make test && make typecheck`
Expected: PASS, aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add scripts/dropbox-auth.js docker-compose.yml README.md
git commit -m "Document the Dropbox backup setup and pass its settings to the container"
```

---

## Après l'implémentation (manuel, avec l'utilisateur)

Ces étapes demandent le compte Dropbox et p-cloud ; elles ne font pas partie des tâches :

1. créer l'app Dropbox, lancer `scripts/dropbox-auth.js`, remplir le `.env` de p-cloud ;
2. publier (`make publish`), attendre Watchtower ;
3. cliquer « Back up now » : le zip apparaît dans `Dropbox/Apps/<app>/`, l'encart affiche la réussite ;
4. le lendemain matin, vérifier la présence de `dexvault_<date>.zip` de la nuit.
