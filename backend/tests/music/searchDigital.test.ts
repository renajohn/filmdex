import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';

const tag = () => Math.random().toString(36).slice(2, 8);

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

const insertAlbum = (title: string, status: string, genre = 'Trip hop') =>
  run(`INSERT INTO albums (title, artist, format, title_status, genres) VALUES (?, ?, 'CD', ?, ?)`,
    [title, JSON.stringify(['Massive Attack']), status, JSON.stringify([genre])]);

const titlesOf = (res: { body: Array<{ title: string }> }) => res.body.map(album => album.title).sort();

describe('recherche avec Digital', () => {
  const word = `Zz${tag()}`;
  const [cd, digital, wish] = [`${word} Mezzanine`, `${word} Protection`, `${word} Heligoland`];

  beforeAll(async () => {
    await insertAlbum(cd, 'owned');
    const digitalId = await insertAlbum(digital, 'digital', `Genre${word}`);
    await insertAlbum(wish, 'wish');
    await run(`INSERT INTO tracks (album_id, disc_number, track_number, title, composers) VALUES (?, 1, 1, 'Karmacoma', ?)`,
      [digitalId, JSON.stringify([`Composer ${word}`])]);
  });

  it('ne trouve que les CD avec Digital off, et aussi les albums sans CD avec Digital on', async () => {
    expect(titlesOf(await request(app).get('/api/music/albums/search').query({ q: word }))).toEqual([cd]);
    expect(titlesOf(await request(app).get('/api/music/albums/search').query({ q: word, digital: '1' }))).toEqual([cd, wish, digital].sort());
  });

  it('cd:no garde ce qu’on n’a pas en CD, cd:yes les CD', async () => {
    expect(titlesOf(await request(app).get('/api/music/albums/search').query({ q: `cd:no ${word}`, digital: '1' }))).toEqual([wish, digital].sort());
    expect(titlesOf(await request(app).get('/api/music/albums/search').query({ q: `cd:yes ${word}`, digital: '1' }))).toEqual([cd]);
    // Digital off, nothing without a CD is searched: cd:no finds nothing.
    expect(titlesOf(await request(app).get('/api/music/albums/search').query({ q: `cd:no ${word}` }))).toEqual([]);
  });

  it('ne propose les genres et compositeurs des albums digitaux qu’avec Digital on', async () => {
    const genre = (digitalOn: boolean) => request(app).get('/api/music/autocomplete').query({ field: 'genre', value: `Genre${word}`, ...(digitalOn ? { digital: '1' } : {}) });
    const composer = (digitalOn: boolean) => request(app).get('/api/music/autocomplete').query({ field: 'composer', value: `Composer ${word}`, ...(digitalOn ? { digital: '1' } : {}) });
    expect((await genre(false)).body).toEqual([]);
    expect((await genre(true)).body.length).toBe(1);
    expect((await composer(false)).body).toEqual([]);
    expect((await composer(true)).body).toEqual([{ composer: `Composer ${word}` }]);
  });
});
