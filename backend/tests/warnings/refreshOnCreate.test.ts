import movieService from '../../src/services/movieService';
import warningsService from '../../src/services/warningsService';
import omdbService from '../../src/services/omdbService';
import ageRecommendationService from '../../src/services/ageRecommendationService';

afterEach(() => jest.restoreAllMocks());

it('programme la récupération des avertissements après la création, sans l’attendre', async () => {
  // OMDB falls back to a public demo key: without these mocks the test would reach the network.
  jest.spyOn(omdbService, 'getMovieRatings').mockResolvedValue({ imdbRating: null, rottenTomatoRating: null } as any);
  jest.spyOn(ageRecommendationService, 'getRecommendedAge').mockResolvedValue(null as any);
  const schedule = jest.spyOn(warningsService, 'scheduleRefresh').mockImplementation(() => undefined);
  const created = await movieService.createMovieWithRatings({
    title: 'Ajout déclencheur', format: 'Blu-ray', title_status: 'owned', tmdb_id: 123456789,
  } as any);
  expect(schedule).toHaveBeenCalledWith(created.id);
});
