import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import navidromeService from '../../src/services/navidromeService';
import ripStatusService from '../../src/services/ripStatusService';

const insertAlbum = (title: string) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO albums (title, artist, format, title_status, genres) VALUES (?, ?, 'CD', 'owned', ?)`,
      [title, JSON.stringify(['David Bowie']), JSON.stringify(['Rock'])],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
    ));

const copy = (id: string, name: string) =>
  ({ id, name, artist: 'David Bowie', musicBrainzId: null, songCount: 2, userRating: 0 });

beforeEach(() => {
  ripStatusService.clearCache();
  jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
  jest.spyOn(navidromeService, 'getSongs').mockResolvedValue([]);
});

afterEach(() => jest.restoreAllMocks());

describe('favourites:', () => {
  it('finds the albums with a track hearted in Navidrome, and the others', async () => {
    const tag = Math.random().toString(36).slice(2);
    const hearted = await insertAlbum(`Heroes ${tag}`);
    const plain = await insertAlbum(`Lodger ${tag}`);
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([copy('nd-h', `Heroes ${tag}`), copy('nd-l', `Lodger ${tag}`)]);
    jest.spyOn(navidromeService, 'getStarredSongAlbums').mockResolvedValue(new Set(['nd-h']));

    const yes = await request(app).get('/api/music/albums/search').query({ q: `favourites:yes ${tag}` });
    expect(yes.status).toBe(200);
    expect(yes.body.map((album: { id: number }) => album.id)).toEqual([hearted]);

    const no = await request(app).get('/api/music/albums/search').query({ q: `favourites:no ${tag}` });
    expect(no.body.map((album: { id: number }) => album.id)).toEqual([plain]);
  });
});
