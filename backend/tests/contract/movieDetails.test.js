const request = require('supertest');
const app = require('../../index');
const Movie = require('../../src/models/movie');
const tmdbService = require('../../src/services/tmdbService');

describe('Movie Details Contract Tests', () => {
  let testMovieId;

  beforeAll(async () => {
    // Mock TMDB service to return test data
    jest.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue({
      id: 12345,
      title: 'Contract Test Movie',
      original_title: 'Contract Test Movie',
      overview: 'A contract test movie plot',
      poster_path: '/test-path.jpg',
      backdrop_path: '/test-backdrop.jpg',
      release_date: '2023-01-01',
      genre_ids: [28],
      genres: [{id: 28, name: 'Action'}],
      credits: {
        cast: [
          {name: 'Actor 1', character: 'Hero'},
          {name: 'Actor 2', character: 'Villain'}
        ],
        crew: [
          {name: 'Director 1', job: 'Director'}
        ]
      },
      videos: {
        results: [
          {
            id: 'abc123',
            key: 'xyz789',
            site: 'YouTube',
            type: 'Trailer'
          }
        ]
      },
      popularity: 100,
      vote_count: 500,
      adult: false,
      video: false,
      budget: 1000000,
      revenue: 5000000,
      status: 'Released'
    });

    // Create a test movie
    const testMovie = {
      title: 'Contract Test Movie',
      plot: 'A contract test movie plot',
      genre: 'Action',
      imdb_rating: 8.5,
      rotten_tomato_rating: 85,
      release_date: '2023-01-01',
      format: 'Blu-ray',
      acquired_date: '2023-01-01',
      tmdb_id: 12345,
      media_type: 'movie',
      original_language: 'en',
      imdb_id: 'tt1234567',
      tmdb_rating: 8.0,
      runtime: 120
    };

    const result = await Movie.create(testMovie);
    testMovieId = result.id;
  });

  afterAll(async () => {
    // Restore the original implementation
    tmdbService.getMovieDetails.mockRestore();
  });

  describe('GET /movies/{id}/details', () => {
    it('should return 200 with movie details when movie exists', async () => {
      // This test will fail initially as the endpoint doesn't exist yet
      const response = await request(app)
        .get(`/api/movies/${testMovieId}/details`)
        .expect(200);

      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('original_title');
      expect(response.body).toHaveProperty('original_language');
      expect(response.body).toHaveProperty('plot');
      expect(response.body).toHaveProperty('genre');
      expect(response.body).toHaveProperty('imdb_rating');
      expect(response.body).toHaveProperty('rotten_tomato_rating');
      expect(response.body).toHaveProperty('rotten_tomatoes_link');
      expect(response.body).toHaveProperty('imdb_link');
      expect(response.body).toHaveProperty('tmdb_link');
      expect(response.body).toHaveProperty('tmdb_rating');
      expect(response.body).toHaveProperty('price');
      expect(response.body).toHaveProperty('runtime');
      expect(response.body).toHaveProperty('comments');
      expect(response.body).toHaveProperty('never_seen');
      expect(response.body).toHaveProperty('year');
      expect(response.body).toHaveProperty('format');
      expect(response.body).toHaveProperty('acquired_date');
      expect(response.body).toHaveProperty('poster_path');
      expect(response.body).toHaveProperty('adult');
      expect(response.body).toHaveProperty('overview');
      expect(response.body).toHaveProperty('release_date');
      expect(response.body).toHaveProperty('genres');
      expect(response.body).toHaveProperty('credits');
      expect(response.body).toHaveProperty('videos');
    });

    it('should return 404 when movie does not exist', async () => {
      const response = await request(app)
        .get('/api/movies/99999/details')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when id is not a valid number', async () => {
      const response = await request(app)
        .get('/api/movies/invalid/details')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
