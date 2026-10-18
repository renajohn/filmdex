import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';
import musicCollectionService from '../../src/services/musicCollectionService';
import listenNextPlaylistService from '../../src/services/listenNextPlaylistService';

const tag = () => Math.random().toString(36).slice(2, 8);

const insertAlbum = (title: string) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(`INSERT INTO albums (title, artist, format, title_status) VALUES (?, ?, 'CD', 'owned')`,
      [title, JSON.stringify([`Artist ${tag()}`])],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

const ids = async () => (await musicCollectionService.getListenNextAlbums()).map(album => album.id);

let first: number;
let second: number;
let third: number;

beforeEach(async () => {
  for (const album of await musicCollectionService.getListenNextAlbums()) await Album.toggleListenNext(album.id);
  [first, second, third] = [await insertAlbum(`First ${tag()}`), await insertAlbum(`Second ${tag()}`), await insertAlbum(`Third ${tag()}`)];
  for (const id of [first, second, third]) await Album.toggleListenNext(id);
  jest.spyOn(listenNextPlaylistService, 'schedule').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('Listen Next réordonné', () => {
  it('suit l’ordre donné et refait la playlist', async () => {
    const res = await request(app).put('/api/collections/listen-next/order').send({ albumIds: [third, first, second] });

    expect(res.status).toBe(200);
    expect(res.body.albums.map((album: { id: number }) => album.id)).toEqual([third, first, second]);
    expect(await ids()).toEqual([third, first, second]);
    expect(listenNextPlaylistService.schedule).toHaveBeenCalled();
  });

  it('garde à la fin un album ajouté entre-temps et ignore un album qui n’y est plus', async () => {
    const fourth = await insertAlbum(`Fourth ${tag()}`);
    await Album.toggleListenNext(fourth);
    const gone = await insertAlbum(`Gone ${tag()}`);

    await request(app).put('/api/collections/listen-next/order').send({ albumIds: [second, gone, first, third] }).expect(200);

    expect(await ids()).toEqual([second, first, third, fourth]);
    // Added after the drag: still at the end.
    const fifth = await insertAlbum(`Fifth ${tag()}`);
    await Album.toggleListenNext(fifth);
    expect(await ids()).toEqual([second, first, third, fourth, fifth]);
  });

  it('refuse ce qui n’est pas une liste d’ids', async () => {
    await request(app).put('/api/collections/listen-next/order').send({ albumIds: 'x' }).expect(400);
    await request(app).put('/api/collections/listen-next/order').send({ albumIds: [1, 'a'] }).expect(400);
    expect(await ids()).toEqual([first, second, third]);
  });
});
