import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';

const tag = () => Math.random().toString(36).slice(2, 8);

const insert = (table: string, status: string) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(table === 'albums'
      ? `INSERT INTO albums (title, title_status, artist) VALUES (?, ?, '["Moby"]')`
      : `INSERT INTO ${table} (title, title_status) VALUES (?, ?)`, [`Wish ${tag()}`, status],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

const spokenFor = (table: string, id: number) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().get(`SELECT spoken_for FROM ${table} WHERE id = ?`, [id],
      (err: Error | null, row: { spoken_for: number }) => (err ? reject(err) : resolve(row.spoken_for))));

const setStatus = (table: string, id: number, status: string) =>
  new Promise<void>((resolve, reject) =>
    getDatabase().run(`UPDATE ${table} SET title_status = ? WHERE id = ?`, [status, id], (err: Error | null) => (err ? reject(err) : resolve())));

describe('Spoken for', () => {
  it.each([
    ['movies', '/api/movies'],
    ['albums', '/api/music/albums'],
    ['books', '/api/books'],
  ])('marque un souhait de %s comme réglé, puis l’en retire', async (table, base) => {
    const id = await insert(table, 'wish');
    await request(app).put(`${base}/${id}/spoken-for`).send({ spokenFor: true }).expect(200, { id, spokenFor: true });
    expect(await spokenFor(table, id)).toBe(1);
    await request(app).put(`${base}/${id}/spoken-for`).send({ spokenFor: false }).expect(200);
    expect(await spokenFor(table, id)).toBe(0);
  });

  it('se lit sur la wish list', async () => {
    const id = await insert('albums', 'wish');
    await request(app).put(`/api/music/albums/${id}/spoken-for`).send({ spokenFor: true }).expect(200);
    const res = await request(app).get('/api/music/albums/status/wish').expect(200);
    expect(res.body.find((a: { id: number }) => a.id === id)).toMatchObject({ spokenFor: true });
  });

  it('ne vaut que pour un souhait', async () => {
    const id = await insert('books', 'owned');
    await request(app).put(`/api/books/${id}/spoken-for`).send({ spokenFor: true }).expect(404);
    await request(app).put(`/api/books/${id}/spoken-for`).send({ spokenFor: 'yes' }).expect(400);
  });

  it('s’efface quand le titre quitte la wish list, et un titre souhaité à nouveau repart de rien', async () => {
    const id = await insert('movies', 'wish');
    await request(app).put(`/api/movies/${id}/spoken-for`).send({ spokenFor: true }).expect(200);
    await setStatus('movies', id, 'owned');
    expect(await spokenFor('movies', id)).toBe(0);
    await setStatus('movies', id, 'wish');
    expect(await spokenFor('movies', id)).toBe(0);
  });
});
