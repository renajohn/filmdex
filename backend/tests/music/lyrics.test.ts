import request from 'supertest';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import app from '../../index';
import { getDatabase } from '../../src/database';
import navidromeService from '../../src/services/navidromeService';
import ripStatusService from '../../src/services/ripStatusService';
import lyricsService, { artistOf, findByTags, lyricsTiming, pickResult, resolveOnDisk } from '../../src/services/lyricsService';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

const insertAlbum = (title: string, artist: string[], status = 'owned') =>
  run(`INSERT INTO albums (title, artist, format, title_status) VALUES (?, ?, 'CD', ?)`, [title, JSON.stringify(artist), status]);

const insertTrack = (albumId: number, track: number, title: string, durationSec = 264, artist: string[] = []) =>
  run(`INSERT INTO tracks (album_id, disc_number, track_number, title, duration_sec, artist) VALUES (?, 1, ?, ?, ?, ?)`,
    [albumId, track, title, durationSec, JSON.stringify(artist)]);

const record = (fields: Partial<{ id: number; duration: number; instrumental: boolean; plainLyrics: string | null; syncedLyrics: string | null }>) => ({
  id: 1, trackName: 'T', artistName: 'A', albumName: 'B', duration: 264, instrumental: false, plainLyrics: 'words', syncedLyrics: null, ...fields,
});

const notFound = () => Object.assign(new Error('404'), { isAxiosError: true, response: { status: 404 } });

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MUSIC_LIBRARY_PATH;
});

describe('lyrics lookup', () => {
  it('prend l’artiste de la piste, sinon celui de l’album, avec un tiret ordinaire', () => {
    expect(artistOf({ trackArtist: '[]', albumArtist: JSON.stringify(['‐M‐']) })).toBe('-M-');
    expect(artistOf({ trackArtist: JSON.stringify(['Queen']), albumArtist: JSON.stringify(['Various Artists']) })).toBe('Queen');
  });

  it('garde le résultat de recherche de la bonne durée, synchronisé d’abord', () => {
    const picked = pickResult([
      record({ id: 1, duration: 300 }),
      record({ id: 2, duration: 262 }),
      record({ id: 3, duration: 266, syncedLyrics: '[00:01.00] words' }),
    ], 264);
    expect(picked?.id).toBe(3);
    expect(pickResult([record({ duration: 300 })], 264)).toBeNull();
  });

  it('cherche une piste à l’ouverture et garde ce qu’il a trouvé', async () => {
    const albumId = await insertAlbum(`OK Computer ${Math.random()}`, ['Radiohead']);
    await insertTrack(albumId, 6, 'Karma Police');
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: record({ id: 13976, plainLyrics: 'Karma police', syncedLyrics: '[00:01.00] Karma police' }) });

    const first = await request(app).get(`/api/music/albums/${albumId}/discs/1/tracks/6/lyrics`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'found', plain: 'Karma police', synced: '[00:01.00] Karma police', source: 'lrclib', sourceId: '13976' });
    expect(get).toHaveBeenCalledWith('https://lrclib.net/api/get', expect.objectContaining({
      params: { artist_name: 'Radiohead', track_name: 'Karma Police', album_name: expect.any(String), duration: 264 },
    }));

    // Kept: no second request.
    get.mockClear();
    expect((await request(app).get(`/api/music/albums/${albumId}/discs/1/tracks/6/lyrics`)).body.status).toBe('found');
    expect(get).not.toHaveBeenCalled();
  });

  it('se rabat sur la recherche, puis sur le titre sans « (Remastered) »', async () => {
    const albumId = await insertAlbum(`Best Of ${Math.random()}`, ['Bee Gees']);
    await insertTrack(albumId, 1, 'Too Much Heaven (Remastered 2007)', 296);
    jest.spyOn(axios, 'get').mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url.endsWith('/get')) throw notFound();
      if (config?.params?.track_name === 'Too Much Heaven') return { data: [record({ id: 7, duration: 297 })] };
      return { data: [] };
    });

    const res = await request(app).get(`/api/music/albums/${albumId}/discs/1/tracks/1/lyrics`);
    expect(res.body).toMatchObject({ status: 'found', sourceId: '7' });
  });

  it('note une piste instrumentale ou introuvable, et la recherche à nouveau sur demande', async () => {
    const albumId = await insertAlbum(`Play ${Math.random()}`, ['Moby']);
    await insertTrack(albumId, 1, 'Guitar Flute & String');
    await insertTrack(albumId, 2, 'Unknown Song');
    const get = jest.spyOn(axios, 'get').mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (config?.params?.track_name === 'Guitar Flute & String' && url.endsWith('/get')) return { data: record({ instrumental: true, plainLyrics: null }) };
      if (url.endsWith('/get')) throw notFound();
      return { data: [] };
    });

    expect((await request(app).get(`/api/music/albums/${albumId}/discs/1/tracks/1/lyrics`)).body.status).toBe('instrumental');
    expect((await request(app).get(`/api/music/albums/${albumId}/discs/1/tracks/2/lyrics`)).body.status).toBe('missing');

    get.mockResolvedValue({ data: record({ plainLyrics: 'now there' }) });
    expect((await request(app).post(`/api/music/albums/${albumId}/discs/1/tracks/2/lyrics`)).body).toMatchObject({ status: 'found', plain: 'now there' });
  });

  it('répond 404 pour une piste que le CD n’a pas', async () => {
    const albumId = await insertAlbum(`Short ${Math.random()}`, ['X']);
    expect((await request(app).get(`/api/music/albums/${albumId}/discs/1/tracks/9/lyrics`)).status).toBe(404);
  });

  it('réessaie quand LRCLIB répond 503, et laisse pour plus tard une piste qui échoue toujours', async () => {
    lyricsTiming.retryDelaysMs = [1, 1];
    const albumId = await insertAlbum(`Flaky ${Math.random()}`, ['Muse']);
    await insertTrack(albumId, 1, 'Flaky Song');
    await insertTrack(albumId, 2, 'Broken Song');
    const unavailable = () => Object.assign(new Error('503'), { isAxiosError: true, response: { status: 503 } });
    let flaky = 0;
    jest.spyOn(axios, 'get').mockImplementation(async (_url: string, config?: { params?: Record<string, unknown> }) => {
      if (config?.params?.track_name === 'Broken Song') throw unavailable();
      if (config?.params?.track_name === 'Flaky Song' && flaky++ < 2) throw unavailable();
      return { data: record({ plainLyrics: 'got it' }) };
    });
    try {
      await lyricsService.lookUpMissing();
    } finally {
      lyricsTiming.retryDelaysMs = [5000, 15000, 45000];
    }
    expect((await request(app).get(`/api/music/albums/${albumId}/discs/1/tracks/1/lyrics`)).body.plain).toBe('got it');
    const broken = await new Promise<unknown>(r => getDatabase().get('SELECT * FROM track_lyrics WHERE album_id = ? AND track_number = 2', [albumId], (_e, row) => r(row)));
    expect(broken).toBeUndefined();
  });

  it('remplit les pistes de la collection jamais cherchées, pas celles de la wish list', async () => {
    // Earlier tests left their tracks looked up; these are the only new ones.
    const owned = await insertAlbum(`Owned ${Math.random()}`, ['Muse']);
    const wished = await insertAlbum(`Wished ${Math.random()}`, ['Muse'], 'wish');
    await insertTrack(owned, 1, 'Blackout');
    await insertTrack(wished, 1, 'Hysteria');
    const asked: unknown[] = [];
    jest.spyOn(axios, 'get').mockImplementation(async (_url: string, config?: { params?: Record<string, unknown> }) => {
      asked.push(config?.params?.track_name);
      return { data: record({}) };
    });

    await lyricsService.lookUpMissing();
    expect(asked).toContain('Blackout');
    expect(asked).not.toContain('Hysteria');
  });
});

describe('.lrc files beside the rips', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dexvault-music-'));
    ripStatusService.clearCache();
    jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('trouve un fichier dont le nom est en Unicode décomposé', () => {
    const nfd = 'Ve\u0301ronique';
    fs.mkdirSync(path.join(root, 'FLAC', 'Zazie', nfd), { recursive: true });
    fs.writeFileSync(path.join(root, 'FLAC', 'Zazie', nfd, '01 Craque.flac'), '');
    // macOS ignores the difference that Linux, on p-cloud, makes: compare both in one form.
    const found = resolveOnDisk(root, 'FLAC/Zazie/V\u00e9ronique/01 Craque.flac');
    expect(found && fs.existsSync(found)).toBe(true);
    expect(found?.normalize('NFC')).toBe(path.join(root, 'FLAC', 'Zazie', 'V\u00e9ronique', '01 Craque.flac'));
    expect(resolveOnDisk(root, 'FLAC/Zazie/Absent/01.flac')).toBeNull();
  });

  it('écrit un .lrc à côté de chaque piste qui a des paroles, sans toucher à un .lrc existant', async () => {
    process.env.MUSIC_LIBRARY_PATH = root;
    const albumId = await insertAlbum(`Lrc ${Math.random()}`, ['Hozier']);
    await insertTrack(albumId, 1, 'Jackie and Wilson');
    await insertTrack(albumId, 2, 'Angel of Small Death');
    await insertTrack(albumId, 3, 'Instrumental');
    await run(`INSERT INTO track_lyrics (album_id, disc_number, track_number, title, status, plain, synced, checked_at) VALUES
      (?, 1, 1, 'Jackie and Wilson', 'found', 'plain words', '[00:01.00] timed words', '2026-10-13'),
      (?, 1, 2, 'Angel of Small Death', 'found', 'mine?', NULL, '2026-10-13'),
      (?, 1, 3, 'Instrumental', 'instrumental', NULL, NULL, '2026-10-13')`, [albumId, albumId, albumId]);

    const dir = path.join(root, 'FLAC', 'Hozier', 'Hozier');
    fs.mkdirSync(dir, { recursive: true });
    for (const name of ['01 Jackie.flac', '02 Angel.flac', '03 Instrumental.flac']) fs.writeFileSync(path.join(dir, name), '');
    fs.writeFileSync(path.join(dir, '02 Angel.lrc'), 'by hand\n');

    jest.spyOn(ripStatusService, 'navidromeAlbums').mockResolvedValue(new Map([[albumId, { id: 'nd-1', name: 'Hozier', artist: 'Hozier', musicBrainzId: null, songCount: 3, userRating: 0 }]]));
    jest.spyOn(navidromeService, 'getAlbumSongs').mockResolvedValue(['01 Jackie.flac', '02 Angel.flac', '03 Instrumental.flac'].map((name, index) => ({
      id: `s${index}`, url: null, discNumber: 1, track: index + 1, title: name, durationSec: 264, suffix: 'flac',
      bitRate: null, bitDepth: 16, samplingRate: 44100, channelCount: 2, size: null, path: `FLAC/Hozier/Hozier/${name}`,
    })));

    const report = await lyricsService.writeLrcFiles();
    expect(report).toEqual({ written: 1, alreadyThere: 1, notOnDisk: 0 });
    expect(fs.readFileSync(path.join(dir, '01 Jackie.lrc'), 'utf8')).toBe('[00:01.00] timed words\n');
    expect(fs.readFileSync(path.join(dir, '02 Angel.lrc'), 'utf8')).toBe('by hand\n');
    expect(fs.existsSync(path.join(dir, '03 Instrumental.lrc'))).toBe(false);
  });

  it('demande le vrai chemin à Navidrome quand Subsonic en invente un à partir des tags', async () => {
    process.env.MUSIC_LIBRARY_PATH = root;
    const albumId = await insertAlbum(`Fake ${Math.random()}`, ['Muse']);
    await insertTrack(albumId, 1, 'Blackout');
    await run(`INSERT INTO track_lyrics (album_id, disc_number, track_number, title, status, plain, checked_at)
      VALUES (?, 1, 1, 'Blackout', 'found', 'words', '2026-10-13')`, [albumId]);
    const dir = path.join(root, 'FLAC', 'Muse', 'Absolution');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01-14 Blackout.flac'), '');

    jest.spyOn(ripStatusService, 'navidromeAlbums').mockResolvedValue(new Map([[albumId, { id: 'nd-2', name: 'Absolution', artist: 'Muse', musicBrainzId: null, songCount: 1, userRating: 0 }]]));
    jest.spyOn(navidromeService, 'getAlbumSongs').mockResolvedValue([{
      id: 's1', url: null, discNumber: 1, track: 1, title: 'Blackout', durationSec: 264, suffix: 'flac',
      bitRate: null, bitDepth: 16, samplingRate: 44100, channelCount: 2, size: null, path: 'Muse/Absolution/01 - Blackout.flac',
    }]);
    jest.spyOn(navidromeService, 'getSongPaths').mockResolvedValue([{ discNumber: 1, track: 1, path: '/music/FLAC/Muse/Absolution/01-14 Blackout.flac' }]);

    expect(await lyricsService.writeLrcFiles()).toEqual({ written: 1, alreadyThere: 0, notOnDisk: 0 });
    expect(fs.readFileSync(path.join(dir, '01-14 Blackout.lrc'), 'utf8')).toBe('words\n');
  });

  it('retrouve un fichier sur le disque d’après le chemin que Navidrome tire des tags', () => {
    const flac = path.join(root, 'FLAC', 'Tracy Chapman', 'Crossroads');
    const mp3 = path.join(root, 'Phil Collins', 'No Jacket Required (1985)');
    fs.mkdirSync(flac, { recursive: true });
    fs.mkdirSync(mp3, { recursive: true });
    for (const name of ['01 Crossroads.flac', '10 All That You Have Is Your Soul.flac', '01 Crossroads.lrc']) fs.writeFileSync(path.join(flac, name), '');
    fs.writeFileSync(path.join(mp3, '1-02 Long Long Way to Go.mp3'), '');

    expect(findByTags(root, 'Tracy Chapman/Crossroads/01-01 - Crossroads.flac', 1, 1)).toBe(path.join(flac, '01 Crossroads.flac'));
    expect(findByTags(root, 'Tracy Chapman/Crossroads/01-10 - All That You Have Is Your Soul.flac', 1, 10)).toBe(path.join(flac, '10 All That You Have Is Your Soul.flac'));
    expect(findByTags(root, 'Phil Collins/No Jacket Required/01-02 - Long Long Way to Go.mp3', 1, 2)).toBe(path.join(mp3, '1-02 Long Long Way to Go.mp3'));
    expect(findByTags(root, 'Tracy Chapman/Crossroads/01-05 - Be Careful of My Heart.flac', 1, 5)).toBeNull();
  });

  it('ne fait rien sans dossier de musique monté', async () => {
    expect(await lyricsService.writeLrcFiles()).toBeNull();
  });
});
