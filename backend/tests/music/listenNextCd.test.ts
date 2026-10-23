import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';
import musicService from '../../src/services/musicService';
import musicCollectionService from '../../src/services/musicCollectionService';
import listenNextPlaylistService from '../../src/services/listenNextPlaylistService';
import listenNextPlayService from '../../src/services/listenNextPlayService';

const tag = () => Math.random().toString(36).slice(2, 8);

const insertAlbum = (title: string, { status = 'owned', genres = '[]', createdAt = '2026-10-01T10:00:00.000Z' } = {}) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(`INSERT INTO albums (title, artist, format, title_status, genres, created_at) VALUES (?, ?, 'CD', ?, ?, ?)`,
      [title, JSON.stringify([`Artist ${tag()}`]), status, genres, createdAt],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

/** Each list as "id:disc", in its order. */
const lists = async () => {
  const albums = await musicCollectionService.getListenNextAlbums();
  const of = (medium: string) => albums.filter(album => album.medium === medium).map(album => `${album.id}:${album.disc ?? 0}`);
  return { digital: of('digital'), cd: of('cd') };
};

beforeEach(async () => {
  for (const id of new Set((await musicCollectionService.getListenNextAlbums()).map(album => album.id))) await Album.toggleListenNext(id);
  jest.spyOn(listenNextPlaylistService, 'schedule').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('Listen Next, streamed and on CD', () => {
  it('puts a CD come in at the end of the CD list, not a wish; a wish bought too, unless Listen Next has it', async () => {
    const added = await musicService.addAlbum({ title: `Rumours ${tag()}`, artist: ['Fleetwood Mac'], format: 'CD' });
    await musicService.addAlbum({ title: `Wished ${tag()}`, artist: ['Someone'], format: 'CD', titleStatus: 'wish' });
    expect((await lists()).cd).toEqual([`${added.id}:0`]);

    const wished = await insertAlbum(`Wish ${tag()}`, { status: 'wish' });
    const streamed = await insertAlbum(`Streamed wish ${tag()}`, { status: 'wish' });
    await Album.toggleListenNext(streamed);
    await request(app).post(`/api/music/albums/${wished}/bought`).send({}).expect(200);
    await request(app).post(`/api/music/albums/${streamed}/bought`).send({}).expect(200);
    expect(await lists()).toEqual({ digital: [`${streamed}:0`], cd: [`${added.id}:0`, `${wished}:0`] });
  });

  it('moves an album to the list asked rather than taking it out; with no list asked, takes it out', async () => {
    const album = await insertAlbum(`Aja ${tag()}`);
    expect((await request(app).put(`/api/music/albums/${album}/listen-next`).send({})).body).toEqual({ id: album, action: 'added', medium: 'digital' });
    expect((await request(app).put(`/api/music/albums/${album}/listen-next`).send({ medium: 'cd' })).body).toEqual({ id: album, action: 'moved', medium: 'cd' });
    expect((await lists()).cd).toEqual([`${album}:0`]);
    // A disc asked for an album in the CD list goes there too.
    await request(app).put(`/api/music/albums/${album}/listen-next`).send({ disc: 2 }).expect(200);
    expect((await lists()).cd).toEqual([`${album}:2`]);
    expect((await request(app).put(`/api/music/albums/${album}/listen-next`).send({})).body).toEqual({ id: album, action: 'removed' });
    expect(await lists()).toEqual({ digital: [], cd: [] });
    await request(app).put(`/api/music/albums/${album}/listen-next`).send({ medium: 'vinyl' }).expect(400);
  });

  it('moves an entry dragged to the start or the end of a list, its other discs with it', async () => {
    const [a, b, c] = [await insertAlbum(`A ${tag()}`), await insertAlbum(`B ${tag()}`), await insertAlbum(`C ${tag()}`)];
    await Album.toggleListenNext(a);
    await Album.toggleListenNext(b, undefined, 'cd');
    await Album.toggleListenNext(c, 1);
    await Album.toggleListenNext(c, 2);
    await request(app).put('/api/collections/listen-next/move').send({ key: `${c}:2`, medium: 'cd', at: 'start' }).expect(200);
    expect(await lists()).toEqual({ digital: [`${a}:0`], cd: [`${c}:1`, `${c}:2`, `${b}:0`] });
    await request(app).put('/api/collections/listen-next/move').send({ key: `${b}:0`, medium: 'digital', at: 'end' }).expect(200);
    expect(await lists()).toEqual({ digital: [`${a}:0`, `${b}:0`], cd: [`${c}:1`, `${c}:2`] });
    // Dropped where the pointer was: before the entry it fell on.
    await request(app).put('/api/collections/listen-next/move').send({ key: `${a}:0`, medium: 'cd', at: 'end', before: `${c}:2` }).expect(200);
    expect(await lists()).toEqual({ digital: [`${b}:0`], cd: [`${c}:1`, `${a}:0`, `${c}:2`] });
    await request(app).put('/api/collections/listen-next/move').send({ key: '99999:0', medium: 'cd' }).expect(404);
    await request(app).put('/api/collections/listen-next/move').send({ key: `${a}:0`, medium: 'tape' }).expect(400);
  });

  it('lets each disc stand in its own list: one on CD, the other streamed', async () => {
    const album = await insertAlbum(`The Wall ${tag()}`);
    for (const disc of [1, 2]) {
      await new Promise<void>((resolve, reject) => getDatabase().run(
        'INSERT INTO tracks (album_id, disc_number, track_number, title) VALUES (?, ?, 1, ?)', [album, disc, `Side ${disc}`], err => (err ? reject(err) : resolve())));
    }
    const other = await insertAlbum(`Other ${tag()}`);
    await Album.toggleListenNext(album);
    await Album.toggleListenNext(other);
    // Disc 2 on CD, the album held whole streamed: disc 1 stays streamed, at the album's place.
    expect(await Album.toggleListenNext(album, 2, 'cd')).toEqual({ id: album, action: 'moved', medium: 'cd' });
    expect(await lists()).toEqual({ digital: [`${album}:1`, `${other}:0`], cd: [`${album}:2`] });
    // Disc 1 asked on CD: it moves there rather than leaving; asked again, it leaves.
    expect(await Album.toggleListenNext(album, 1, 'cd')).toEqual({ id: album, action: 'moved', medium: 'cd' });
    expect(await lists()).toEqual({ digital: [`${other}:0`], cd: [`${album}:2`, `${album}:1`] });
    expect(await Album.toggleListenNext(album, 1, 'cd')).toEqual({ id: album, action: 'removed' });
    // A disc dragged to the other list goes alone when the album's other discs stand elsewhere.
    await Album.toggleListenNext(album, 1, 'digital');
    await request(app).put('/api/collections/listen-next/move').send({ key: `${album}:2`, medium: 'digital', at: 'start' }).expect(200);
    expect(await lists()).toEqual({ digital: [`${album}:2`, `${other}:0`, `${album}:1`], cd: [] });
  });

  it('plays and lets go of the streamed list alone: a CD leaves only by hand', async () => {
    const [streamed, cd] = [await insertAlbum(`Streamed ${tag()}`), await insertAlbum(`On CD ${tag()}`)];
    await Album.toggleListenNext(streamed);
    await Album.toggleListenNext(cd, undefined, 'cd');
    expect((await musicCollectionService.getListenNextAlbums('digital')).map(album => album.id)).toEqual([streamed]);
    expect(await listenNextPlayService.markPlayed(cd)).toBeNull();
    expect((await lists()).cd).toEqual([`${cd}:0`]);
    expect(await listenNextPlayService.markPlayed(streamed)).not.toBeNull();
  });

  it('starts the CD list with the CDs come in lately, the classical ones and those in Listen Next left', async () => {
    const lately = await insertAlbum(`Lately ${tag()}`, { createdAt: '2026-09-12T10:00:00.000Z' });
    const old = await insertAlbum(`Old ${tag()}`, { createdAt: '2025-10-01T10:00:00.000Z' });
    const baroque = await insertAlbum(`Baroque ${tag()}`, { genres: JSON.stringify(['Classical', 'Baroque']), createdAt: '2026-09-20T10:00:00.000Z' });
    const streamed = await insertAlbum(`Streamed ${tag()}`, { createdAt: '2026-10-02T10:00:00.000Z' });
    await Album.toggleListenNext(streamed);
    await musicCollectionService.seedCdList('2026-09-01');
    const { cd, digital } = await lists();
    expect(cd).toContain(`${lately}:0`);
    expect(cd).not.toContain(`${old}:0`);
    expect(cd).not.toContain(`${baroque}:0`);
    expect(digital).toEqual([`${streamed}:0`]);
  });
});
