import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import MovieWarning from '../../src/models/movieWarning';

const insertMovie = (title: string, tmdbId: number) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO movies (title, tmdb_id, title_status) VALUES (?, ?, 'owned')`,
      [title, tmdbId],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
    ));

describe('GET /api/collections/watch-next/movies', () => {
  it('porte le classement araignées et serpents de chaque film', async () => {
    const id = await insertMovie('Watch Next araignées', 610001);
    await MovieWarning.saveVotes(id, 'spiders', 125, 0, '2026-09-23T00:00:00.000Z');
    expect((await request(app).put(`/api/movies/${id}/watch-next`)).status).toBe(200);

    const res = await request(app).get('/api/collections/watch-next/movies');

    expect(res.status).toBe(200);
    const movie = res.body.find((m: { id: number }) => m.id === id);
    expect(movie).toMatchObject({ spiders_status: 'with', snakes_status: 'unknown' });
  });
});
