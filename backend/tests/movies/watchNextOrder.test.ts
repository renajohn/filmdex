import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Movie from '../../src/models/movie';
import Collection from '../../src/models/collection';
import collectionService from '../../src/services/collectionService';

const tag = () => Math.random().toString(36).slice(2, 8);

const insertMovie = (title: string) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(`INSERT INTO movies (title, release_date, format, title_status) VALUES (?, '2000-01-01', 'Blu-ray', 'owned')`,
      [title], function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

/** As the banner shows it. */
const banner = async () => (await collectionService.getWatchNextMovies()).map(movie => movie.id);
/** As a movie's card shows it: the collection as it is. */
const card = async () => {
  const watchNext = await Collection.findByType('watch_next');
  return (await collectionService.getCollectionMovies(watchNext!.id)).movies.map(movie => movie.id);
};

let first: number;
let second: number;
let third: number;

beforeEach(async () => {
  for (const id of await banner()) await Movie.toggleWatchNext(id);
  [first, second, third] = [await insertMovie(`First ${tag()}`), await insertMovie(`Second ${tag()}`), await insertMovie(`Third ${tag()}`)];
  for (const id of [first, second, third]) await Movie.toggleWatchNext(id);
});

describe('Watch Next réordonné', () => {
  it('suit l’ordre donné, le même sur la bannière et dans la fiche', async () => {
    expect(await banner()).toEqual([first, second, third]);

    const res = await request(app).put('/api/collections/watch-next/order').send({ movieIds: [first, third, second] });

    expect(res.status).toBe(200);
    expect(res.body.movies.map((movie: { id: number }) => movie.id)).toEqual([first, third, second]);
    expect(await banner()).toEqual([first, third, second]);
    expect(await card()).toEqual([first, third, second]);
  });

  it('garde un film ajouté entre-temps après les autres, comme le prochain ajouté', async () => {
    const fourth = await insertMovie(`Fourth ${tag()}`);
    await Movie.toggleWatchNext(fourth);
    const gone = await insertMovie(`Gone ${tag()}`);

    await request(app).put('/api/collections/watch-next/order').send({ movieIds: [first, gone, second, third] }).expect(200);
    expect(await banner()).toEqual([first, second, third, fourth]);

    const fifth = await insertMovie(`Fifth ${tag()}`);
    await Movie.toggleWatchNext(fifth);
    expect(await banner()).toEqual([first, second, third, fourth, fifth]);
  });

  it('refuse ce qui n’est pas une liste d’ids', async () => {
    await request(app).put('/api/collections/watch-next/order').send({ movieIds: 'x' }).expect(400);
    expect(await banner()).toEqual([first, second, third]);
  });
});
