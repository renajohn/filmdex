import request from 'supertest';
import axios from 'axios';
import app from '../../index';
import { getDatabase } from '../../src/database';
import navidromeService from '../../src/services/navidromeService';
import ripStatusService from '../../src/services/ripStatusService';

const insertAlbum = (fields: { title: string; artist: string[]; releaseId?: string; format?: string; status?: string }) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO albums (title, artist, musicbrainz_release_id, format, title_status) VALUES (?, ?, ?, ?, ?)`,
      [fields.title, JSON.stringify(fields.artist), fields.releaseId ?? null, fields.format ?? 'CD', fields.status ?? 'owned'],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
    ));

const album = (id: string, name: string, artist: string, musicBrainzId?: string) => ({ id, name, artist, musicBrainzId: musicBrainzId ?? null, songCount: 2 });
const songs = (albumId: string, suffix: string, bitDepth: number | null = null) =>
  [1, 2].map(() => ({ albumId, suffix, bitDepth }));

beforeEach(() => {
  ripStatusService.clearCache();
  jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

const statusOf = async (id: number) => {
  const res = await request(app).get('/api/music/rip-status');
  expect(res.status).toBe(200);
  return res.body.albums.find((a: { id: number }) => a.id === id);
};

describe('rip status', () => {
  it('reconnaît un CD rippé en FLAC par son ID MusicBrainz', async () => {
    const id = await insertAlbum({ title: `Mezzanine ${Math.random()}`, artist: ['Massive Attack'], releaseId: `rel-${Math.random()}` });
    const releaseId = (await new Promise<any>(r => getDatabase().get('SELECT musicbrainz_release_id FROM albums WHERE id = ?', [id], (_e, row) => r(row)))).musicbrainz_release_id;
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('nd-1', 'Mezzanine', 'Massive Attack', releaseId)]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-1', 'flac'));

    expect(await statusOf(id)).toMatchObject({ state: 'lossless', formats: ['FLAC'], matches: [{ match: 'musicbrainz' }] });
  });

  it('classe en « pas en lossless » un vieux rip MP3 retrouvé par titre et artiste', async () => {
    const title = `Back to Black ${Math.random().toString(36).slice(2, 8)}`;
    const id = await insertAlbum({ title, artist: ['Amy Winehouse'] });
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('nd-2', `${title} (Deluxe Edition)`, 'Amy Winehouse')]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-2', 'mp3'));

    expect(await statusOf(id)).toMatchObject({ state: 'lossy', formats: ['MP3'], matches: [{ match: 'title' }] });
  });

  it('retient la meilleure copie quand le nouveau rip côtoie l’ancien MP3', async () => {
    const title = `Abbey Road ${Math.random().toString(36).slice(2, 8)}`;
    const id = await insertAlbum({ title, artist: ['The Beatles'] });
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('old', title, 'The Beatles'), album('new', title, 'Beatles, The')]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue([...songs('old', 'mp3'), ...songs('new', 'm4a', 16)]);

    expect(await statusOf(id)).toMatchObject({ state: 'lossless', formats: ['ALAC', 'MP3'] });
  });

  it('distingue l’AAC de l’ALAC dans un .m4a', async () => {
    const title = `Tea for the Tillerman ${Math.random().toString(36).slice(2, 8)}`;
    const id = await insertAlbum({ title, artist: ['Cat Stevens'] });
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('nd-3', title, 'Cat Stevens')]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-3', 'm4a'));

    expect(await statusOf(id)).toMatchObject({ state: 'lossy', formats: ['AAC'] });
  });

  it('trouve une partie d’un titre Discogs traduit, mais pas le même titre d’un autre artiste', async () => {
    const word = Math.random().toString(36).slice(2, 8);
    const id = await insertAlbum({ title: `Cellokonzerte ${word} • Cello Concertos ${word}`, artist: ['Antonio Vivaldi', 'Mstislav Rostropovich'] });
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([
      album('nd-4', `Cello Concertos ${word}`, 'Mstislav Rostropovich; Paul Sacher'),
      album('nd-5', `Cello Concertos ${word}`, 'Yo-Yo Ma'),
    ]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-4', 'flac'));

    const status = await statusOf(id);
    expect(status.state).toBe('lossless');
    expect(status.matches).toHaveLength(1);
  });

  it('laisse de côté la wish list et dit quand Navidrome n’est pas configuré', async () => {
    jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(false);
    const wished = await insertAlbum({ title: `Wished ${Math.random()}`, artist: ['X'], status: 'wish' });
    const owned = await insertAlbum({ title: `Owned ${Math.random()}`, artist: ['X'] });

    const res = await request(app).get('/api/music/rip-status');

    expect(res.body.configured).toBe(false);
    const ids = res.body.albums.map((a: { id: number }) => a.id);
    expect(ids).toContain(owned);
    expect(ids).not.toContain(wished);
    expect(res.body.albums.find((a: { id: number }) => a.id === owned).state).toBe('none');
  });
});

describe('navidromeService', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('s’authentifie par jeton salé sans envoyer le mot de passe, et tourne les pages', async () => {
    jest.restoreAllMocks();
    process.env.NAVIDROME_USER = 'dexvault';
    process.env.NAVIDROME_PASSWORD = 'secret';
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `A${i}` }));
    const get = jest.spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { 'subsonic-response': { status: 'ok', albumList2: { album: page(500) } } } })
      .mockResolvedValueOnce({ data: { 'subsonic-response': { status: 'ok', albumList2: { album: page(3) } } } });

    expect(await navidromeService.getAlbums()).toHaveLength(503);
    const params = (get.mock.calls[0][1] as { params: Record<string, string> }).params;
    expect(get.mock.calls[0][0]).toBe('http://navidrome:4533/rest/getAlbumList2');
    expect(params).toMatchObject({ u: 'dexvault', f: 'json', offset: 0 });
    expect(JSON.stringify(get.mock.calls)).not.toContain('secret');
    expect((get.mock.calls[1][1] as { params: Record<string, number> }).params.offset).toBe(500);
  });
});
