import app from '../../index';
import { getDatabase } from '../../src/database';
import MovieCast from '../../src/models/movieCast';
import tmdbService from '../../src/services/tmdbService';
import movieCreditsService from '../../src/services/movieCreditsService';

const run = (sql: string, params: unknown[]) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

beforeAll(async () => { await (app as unknown as { serverReady: Promise<void> }).serverReady; });
afterEach(() => jest.restoreAllMocks());

describe('Les rôles des acteurs', () => {
  it('sont retrouvés chez TMDB pour les films ajoutés sans eux', async () => {
    const movieId = await run(`INSERT INTO movies (title, release_date, format, title_status, tmdb_id) VALUES ('The Others', '2001-08-02', 'DVD', 'owned', 1933)`, []);
    await run(`INSERT INTO movie_cast (movie_id, name, character, order_index) VALUES (?, 'Nicole Kidman', NULL, 0)`, [movieId]);
    await run(`INSERT INTO movie_cast (movie_id, name, character, order_index) VALUES (?, 'Someone Else', NULL, 1)`, [movieId]);
    const getCredits = jest.spyOn(tmdbService, 'getCredits').mockResolvedValue([
      { id: 2227, name: 'Nicole Kidman', character: 'Grace Stewart', profile_path: null, order: 0 },
    ]);

    await movieCreditsService.fillCharacters();

    expect(getCredits).toHaveBeenCalledWith(1933, 'movie');
    const cast = await MovieCast.findByMovieId(movieId);
    expect(cast.map(actor => [actor.name, actor.character, actor.tmdb_cast_id])).toEqual([
      ['Nicole Kidman', 'Grace Stewart', 2227],
      ['Someone Else', null, null],
    ]);
  });
});
