import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import ddd, { DddQuotaError } from '../../src/services/doesTheDogDieService';
import warningsService from '../../src/services/warningsService';

const insertMovie = () =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO movies (title, tmdb_id, imdb_id, title_status) VALUES (?, ?, ?, 'owned')`,
      [`Route film ${Math.random()}`, Math.floor(Math.random() * 1e9), `tt${Math.floor(Math.random() * 1e9)}`],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
    ));

afterEach(() => jest.restoreAllMocks());

describe('routes des avertissements', () => {
  it('renvoie les avertissements d’un film', async () => {
    const id = await insertMovie();
    const res = await request(app).get(`/api/movies/${id}/warnings`);
    expect(res.status).toBe(200);
    expect(res.body.topics.map((t: { topic: string }) => t.topic)).toEqual(['spiders', 'snakes']);
  });

  it('répond 404 pour un film inconnu', async () => {
    expect((await request(app).get('/api/movies/99999999/warnings')).status).toBe(404);
  });

  it('enregistre puis efface une correction manuelle', async () => {
    const id = await insertMovie();
    let res = await request(app).put(`/api/movies/${id}/warnings/spiders/override`).send({ override: 'without' });
    expect(res.status).toBe(200);
    expect(res.body.topics[0]).toMatchObject({ topic: 'spiders', status: 'without', override: 'without' });

    res = await request(app).put(`/api/movies/${id}/warnings/spiders/override`).send({ override: null });
    expect(res.body.topics[0]).toMatchObject({ status: 'unknown', override: null });
  });

  it.each([
    ['dogs', { override: 'with' }],
    ['spiders', { override: 'maybe' }],
    ['spiders', {}],
  ])('refuse le sujet %s avec %j', async (topic, body) => {
    const id = await insertMovie();
    expect((await request(app).put(`/api/movies/${id}/warnings/${topic}/override`).send(body)).status).toBe(400);
  });

  it('enregistre un lien manuel', async () => {
    const id = await insertMovie();
    jest.spyOn(ddd, 'isConfigured').mockReturnValue(true);
    jest.spyOn(ddd, 'getVotes').mockResolvedValue({ spiders: { yes: 0, no: 2 }, snakes: { yes: 0, no: 2 } });
    const res = await request(app).put(`/api/movies/${id}/ddd-link`).send({ dddId: 22644 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dddId: 22644, matchedBy: 'manual' });
  });

  it.each([{ dddId: 'abc' }, { dddId: -3 }, { dddId: 1.5 }, {}])('refuse le lien %j', async body => {
    const id = await insertMovie();
    expect((await request(app).put(`/api/movies/${id}/ddd-link`).send(body)).status).toBe(400);
  });

  it('répond 503 au rafraîchissement sans clé', async () => {
    const id = await insertMovie();
    expect((await request(app).post(`/api/movies/${id}/warnings/refresh`)).status).toBe(503);
  });

  it('répond 429 quand DoesTheDogDie refuse', async () => {
    const id = await insertMovie();
    jest.spyOn(ddd, 'isConfigured').mockReturnValue(true);
    jest.spyOn(warningsService, 'refreshMovie').mockRejectedValue(new DddQuotaError(429));
    expect((await request(app).post(`/api/movies/${id}/warnings/refresh`)).status).toBe(429);
  });

  it('importe un snapshot et refuse un corps sans liste de films', async () => {
    expect((await request(app).post('/api/warnings/import').send({ fetched_at: '2026-09-23' })).status).toBe(400);
    const res = await request(app).post('/api/warnings/import').send({ fetched_at: '2026-09-23', movies: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ imported: 0, skipped: [] });
  });

  it.each(['yesterday', '', 42])('refuse un snapshot daté %j', async fetchedAt => {
    const res = await request(app).post('/api/warnings/import').send({ fetched_at: fetchedAt, movies: [] });
    expect(res.status).toBe(400);
  });
});
