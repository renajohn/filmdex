import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';

const run = (sql: string, params: unknown[] = []) => new Promise<number>((resolve, reject) =>
  getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

describe('GET /api/books/autocomplete, for the keys of BookDex’s search', () => {
  beforeAll(async () => {
    await run(`INSERT INTO books (title, authors, artists, language, title_status) VALUES ('Incal', '["Jodorowsky"]', '["Moebius"]', 'fr', 'owned')`);
  });

  it('offers the artists of the books for artist:', async () => {
    const res = await request(app).get('/api/books/autocomplete').query({ field: 'artist', value: 'moeb' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('Moebius');
  });

  it('offers the languages of the books for language:', async () => {
    const res = await request(app).get('/api/books/autocomplete').query({ field: 'language', value: '' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining({ language: 'fr' })]));
  });

  it('still refuses a field it does not know', async () => {
    const res = await request(app).get('/api/books/autocomplete').query({ field: 'rowid', value: 'x' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
