import request from 'supertest';
import sharp from 'sharp';
import app from '../../index';
import { getDatabase } from '../../src/database';

const run = (sql: string, params: unknown[] = []) => new Promise<number>((resolve, reject) =>
  getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

describe('les photos d’un livre', () => {
  it('garde la photo de son recto comme couverture, celle de son verso à part', async () => {
    const id = await run(`INSERT INTO books (title, authors, title_status, urls) VALUES ('Sorceline 4', '[]', 'owned', '{}')`);
    const photo = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#357' } }).jpeg().toBuffer();

    const front = (await request(app).post(`/api/books/${id}/upload-cover`).attach('cover', photo, 'front.jpg').expect(200)).body;
    expect(front.cover).toMatch(/^\/api\/images\/book\/custom\//);
    const back = (await request(app).post(`/api/books/${id}/upload-back-cover`).attach('cover', photo, 'back.jpg').expect(200)).body;

    const book = (await request(app).get(`/api/books/${id}`).expect(200)).body;
    expect(book).toMatchObject({ cover: front.cover, backCover: back.cover });
    expect(back.cover).not.toBe(front.cover);
    // An edit of the book keeps its back.
    await request(app).put(`/api/books/${id}`).send({ ...book, title: 'Sorceline, tome 4' }).expect(200);
    expect((await request(app).get(`/api/books/${id}`).expect(200)).body.backCover).toBe(back.cover);
  });
});
