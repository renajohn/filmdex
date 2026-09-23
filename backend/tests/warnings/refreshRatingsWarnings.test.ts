import { getDatabase } from '../../src/database';
import movieService from '../../src/services/movieService';
import warningsService from '../../src/services/warningsService';
import tmdbService from '../../src/services/tmdbService';
import omdbService from '../../src/services/omdbService';
import { DddQuotaError } from '../../src/services/doesTheDogDieService';

const insertMovie = (title: string, tmdbId: number) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO movies (title, tmdb_id, imdb_id, title_status) VALUES (?, ?, 'tt0000001', 'owned')`,
      [title, tmdbId],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
    ));

beforeEach(() => {
  jest.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue({ id: 1, imdb_id: 'tt0000001', vote_average: 7.1 } as any);
  jest.spyOn(omdbService, 'getMovieByImdbId').mockResolvedValue({ imdbRating: '7.5', rottenTomatoRating: '80' } as any);
});
afterEach(() => jest.restoreAllMocks());

describe('refreshMovieRatings', () => {
  it('rafraîchit aussi les votes araignées et serpents', async () => {
    const id = await insertMovie('Rafraîchir notes et votes', 620001);
    const refresh = jest.spyOn(warningsService, 'refreshMovie').mockResolvedValue('updated');

    const movie = await movieService.refreshMovieRatings(id);

    expect(refresh).toHaveBeenCalledWith(id);
    expect(movie.imdb_rating).toBe(7.5);
  });

  it('rafraîchit les notes même quand DoesTheDogDie refuse', async () => {
    const id = await insertMovie('Notes malgré le quota', 620002);
    jest.spyOn(warningsService, 'refreshMovie').mockRejectedValue(new DddQuotaError(429));

    const movie = await movieService.refreshMovieRatings(id);

    expect(movie.imdb_rating).toBe(7.5);
  });
});
