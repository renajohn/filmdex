import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';

const run = (sql: string, params: unknown[] = []) => new Promise<number>((resolve, reject) =>
  getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

describe('GET /api/books/autocomplete, for the keys of BookDex’s search', () => {
  beforeAll(async () => {
    await run(`INSERT INTO books (title, subtitle, isbn, authors, artists, language, title_status) VALUES ('Incal', 'La lumière noire', '9782731611762', '["Jodorowsky"]', '["Moebius"]', 'fr', 'owned')`);
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

  it('offers the subtitles and the ISBNs of the books for subtitle: and isbn:', async () => {
    const subtitle = await request(app).get('/api/books/autocomplete').query({ field: 'subtitle', value: 'lumi' });
    expect(subtitle.status).toBe(200);
    expect(JSON.stringify(subtitle.body)).toContain('La lumière noire');
    const isbn = await request(app).get('/api/books/autocomplete').query({ field: 'isbn', value: '978273' });
    expect(isbn.status).toBe(200);
    expect(JSON.stringify(isbn.body)).toContain('9782731611762');
  });

  it('still refuses a field it does not know', async () => {
    const res = await request(app).get('/api/books/autocomplete').query({ field: 'rowid', value: 'x' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
