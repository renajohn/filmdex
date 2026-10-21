import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import tmdbService from '../../src/services/tmdbService';
import imageService from '../../src/services/imageService';
import omdbService from '../../src/services/omdbService';
import movieCreditsService from '../../src/services/movieCreditsService';
import ageRecommendationService from '../../src/services/ageRecommendationService';
import warningsService from '../../src/services/warningsService';

let nextId = 900000 + Math.floor(Math.random() * 90000);
const tmdbId = () => ++nextId;

const details = (id: number, title: string) => ({
  id, title, original_title: title, release_date: '2002-06-14', poster_path: `/p${id}.jpg`, backdrop_path: `/b${id}.jpg`,
  overview: 'A man without a memory.', genres: [{ id: 1, name: 'Action' }], imdb_id: `tt${id}`, runtime: 119, vote_average: 7.4,
  credits: { cast: [{ name: 'Matt Damon', profile_path: null }], crew: [{ name: 'Doug Liman', job: 'Director', profile_path: null }] },
  videos: { results: [] }, media_type: 'movie',
});

const insertMovie = (fields: { tmdbId: number; title: string; format: string; status: string }) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(`INSERT INTO movies (title, tmdb_id, format, title_status, release_date, acquired_date) VALUES (?, ?, ?, ?, '2002-06-14', '2026-01-01')`,
      [fields.title, fields.tmdbId, fields.format, fields.status],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

const row = (id: number) => new Promise<Record<string, unknown>>((resolve, reject) =>
  getDatabase().get('SELECT * FROM movies WHERE id = ?', [id], (err: Error | null, r: Record<string, unknown>) => (err ? reject(err) : resolve(r))));

beforeEach(() => {
  jest.spyOn(imageService, 'downloadPoster').mockResolvedValue('/images/posters/x.jpg');
  jest.spyOn(imageService, 'downloadBackdrop').mockResolvedValue('/images/backdrops/x.jpg');
  jest.spyOn(omdbService, 'getMovieByImdbId').mockResolvedValue({ imdbRating: 7.9, rottenTomatoRating: '84' } as never);
  jest.spyOn(ageRecommendationService, 'getRecommendedAge').mockResolvedValue(12);
  jest.spyOn(movieCreditsService, 'processCastAndCrew').mockResolvedValue();
  jest.spyOn(warningsService, 'scheduleRefresh').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('le chercheur de films', () => {
  it('trouve les films avec leur réalisateur et ce qu’on en a, et les personnes et sagas que les mots nomment', async () => {
    const id = tmdbId();
    await insertMovie({ tmdbId: id, title: 'The Bourne Identity', format: 'DVD', status: 'owned' });
    jest.spyOn(tmdbService, 'searchAll').mockResolvedValue([
      { id, title: 'The Bourne Identity', original_title: 'The Bourne Identity', release_date: '2002-06-14', poster_path: '/b.jpg', media_type: 'movie' },
    ] as never);
    jest.spyOn(tmdbService, 'getMovieDirectors').mockResolvedValue(['Doug Liman']);
    jest.spyOn(tmdbService, 'searchPeople').mockResolvedValue([
      { id: 1, name: 'Jason Bourne', known_for_department: 'Acting', popularity: 1 },
      { id: 2, name: 'Matt Damon', known_for_department: 'Acting', popularity: 50 },
      { id: 3, name: 'Kate Bourne', known_for_department: 'Costume', popularity: 9 },
    ]);
    jest.spyOn(tmdbService, 'searchCollections').mockResolvedValue([{ id: 31562, name: 'The Bourne Collection' }, { id: 9, name: 'Other Saga' }]);
    jest.spyOn(tmdbService, 'getCollection').mockResolvedValue({ id: 31562, name: 'The Bourne Collection', parts: [{ id: 1, title: 'a' }, { id: 2, title: 'b' }] });

    const res = await request(app).get('/api/movies/finder/search').query({ q: 'bourne' }).expect(200);

    expect(res.body.movies[0]).toMatchObject({ title: 'The Bourne Identity', year: '2002', directors: ['Doug Liman'], have: { owned: [{ format: 'DVD' }], wished: null } });
    expect(res.body.people.map((p: { name: string }) => p.name)).toEqual(['Jason Bourne']);
    expect(res.body.sagas).toEqual([expect.objectContaining({ id: 31562, name: 'The Bourne Collection', movies: 2 })]);
  });

  it('donne les films d’une personne, réalisés et joués, du plus ancien au plus récent', async () => {
    jest.spyOn(tmdbService, 'getPerson').mockResolvedValue({ id: 2419, name: 'Jean-Pierre Jeunet', known_for_department: 'Directing' });
    jest.spyOn(tmdbService, 'getPersonMovieCredits').mockResolvedValue({
      crew: [{ id: 194, title: 'Amélie', release_date: '2001-04-25', job: 'Director' }, { id: 892, title: 'Delicatessen', release_date: '1991-04-17', job: 'Director' },
        { id: 194, title: 'Amélie', release_date: '2001-04-25', job: 'Writer' }],
      cast: [{ id: 5, title: 'A cameo', release_date: '2010-01-01', character: 'Himself' }],
    });

    const res = await request(app).get('/api/movies/finder/people/2419').expect(200);

    expect(res.body.person).toMatchObject({ name: 'Jean-Pierre Jeunet', role: 'director' });
    expect(res.body.directed.map((m: { title: string }) => m.title)).toEqual(['Delicatessen', 'Amélie']);
    expect(res.body.actedIn.map((m: { title: string }) => m.title)).toEqual(['A cameo']);
  });

  it('ajoute un film tout de suite, ses notes et son casting suivant en arrière-plan', async () => {
    const id = tmdbId();
    jest.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue(details(id, 'The Bourne Identity') as never);

    const res = await request(app).post('/api/movies/finder/movies')
      .send({ tmdbId: id, titleStatus: 'owned', format: 'Blu-ray 4K', edition: 'Steelbook', price: '24.90', acquiredDate: '2026-10-20' }).expect(201);

    expect(res.body).toMatchObject({ title: 'The Bourne Identity, Steelbook', format: 'Blu-ray 4K', title_status: 'owned', price: 24.9, acquired_date: '2026-10-20', director: 'Doug Liman' });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(await row(res.body.id)).toMatchObject({ imdb_rating: 7.9, recommended_age: 12, backdrop_path: '/images/backdrops/x.jpg' });
    expect(movieCreditsService.processCastAndCrew).toHaveBeenCalledWith(res.body.id, expect.anything(), id);
  });

  it('refuse un doublon exact, et fait d’un film souhaité le film de la collection', async () => {
    const id = tmdbId();
    jest.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue(details(id, 'Amélie') as never);
    const wished = await insertMovie({ tmdbId: id, title: 'Amélie', format: 'Blu-ray', status: 'wish' });

    await request(app).post('/api/movies/finder/movies').send({ tmdbId: id, titleStatus: 'wish', format: 'Blu-ray' }).expect(409);
    const res = await request(app).post('/api/movies/finder/movies').send({ tmdbId: id, titleStatus: 'owned', format: 'Blu-ray', price: 12 }).expect(201);

    expect(res.body).toMatchObject({ id: wished, title_status: 'owned', price: 12 });
    await request(app).post('/api/movies/finder/movies').send({ tmdbId: id, titleStatus: 'owned', format: 'Blu-ray' }).expect(409);
  });

  it('ajoute un coffret : ses films dans l’ordre, un format, le prix partagé', async () => {
    const ids = [tmdbId(), tmdbId(), tmdbId()];
    jest.spyOn(tmdbService, 'getMovieDetails').mockImplementation(async (id: number) => details(id, `Bourne ${ids.indexOf(id) + 1}`) as never);
    const name = `Coffret trilogie, Jason Bourne ${ids[0]}`;

    const res = await request(app).post('/api/movies/finder/box-sets')
      .send({ name, movies: ids.map(id => ({ tmdbId: id })), titleStatus: 'owned', format: 'Blu-ray', price: '30', acquiredDate: '2026-10-21' }).expect(201);

    expect(res.body.movies.map((m: { title: string; price: number; format: string }) => [m.title, m.price, m.format]))
      .toEqual([['Bourne 1', 10, 'Blu-ray'], ['Bourne 2', 10, 'Blu-ray'], ['Bourne 3', 10, 'Blu-ray']]);
    const box = await request(app).get(`/api/collections/${res.body.collection.id}/movies`).expect(200);
    const movies = Array.isArray(box.body) ? box.body : box.body.movies;
    expect(movies.map((m: { title: string; collection_order: number }) => [m.title, m.collection_order])).toEqual([['Bourne 1', 1], ['Bourne 2', 2], ['Bourne 3', 3]]);
  });

  it('achète des films souhaités, le prix partagé, et refuse un format qu’on a déjà', async () => {
    const id = tmdbId();
    const a = await insertMovie({ tmdbId: id, title: 'Die Hard', format: 'Blu-ray 4K', status: 'wish' });
    const b = await insertMovie({ tmdbId: tmdbId(), title: 'Die Hard 2', format: 'Blu-ray 4K', status: 'wish' });

    const res = await request(app).post('/api/movies/finder/buy').send({ movieIds: [a, b], format: 'Blu-ray', price: 20, acquiredDate: '2026-10-19' }).expect(200);

    expect(res.body.map((m: { title_status: string; price: number; format: string; acquired_date: string }) => [m.title_status, m.price, m.format, m.acquired_date]))
      .toEqual([['owned', 10, 'Blu-ray', '2026-10-19'], ['owned', 10, 'Blu-ray', '2026-10-19']]);

    const c = await insertMovie({ tmdbId: id, title: 'Die Hard', format: 'DVD', status: 'wish' });
    await request(app).post('/api/movies/finder/buy').send({ movieIds: [c], format: 'Blu-ray' }).expect(409);
  });
});
