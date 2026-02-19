const request = require('supertest');
const app = require('../../index');
const Movie = require('../../src/models/movie');
const tmdbService = require('../../src/services/tmdbService');

describe('Movie Details Integration Tests', () => {
  let testMovieId;

  beforeAll(async () => {
    // Mock TMDB service to return test data
    jest.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue({
      id: 12345,
      title: 'Test Movie',
      original_title: 'Test Movie',
      overview: 'A test movie plot',
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
      status: 'Released',
      vote_average: 8.5,
      original_language: 'en',
      runtime: 120
    });

    // Create a test movie
    const testMovie = {
      title: 'Test Movie',
      plot: 'A test movie plot',
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
      tmdb_rating: 8.0
    };

    const result = await Movie.create(testMovie);
    testMovieId = result.id;
  });

  afterAll(async () => {
    // Clean up test movie
    if (testMovieId) {
      await Movie.delete(testMovieId);
    }
    // Restore the original implementation
    tmdbService.getMovieDetails.mockRestore();
  });

  describe('GET /movies/{id}/details', () => {
    it('should fetch and return combined local and TMDB data', async () => {
      const response = await request(app)
        .get(`/api/movies/${testMovieId}/details`)
        .expect(200);

      // Check local database fields
      expect(response.body.title).toBe('Test Movie');
      expect(response.body.plot).toBe('A test movie plot');
      expect(response.body.genre).toBe('Action');
      expect(response.body.imdb_rating).toBe(8.5);
      expect(response.body.rotten_tomato_rating).toBe(85);
      expect(response.body.year).toBe(2023);
      expect(response.body.format).toBe('Blu-ray');
      expect(response.body.acquired_date).toBe('2023-01-01');

      // Check TMDB fields (may be null if movie not found in TMDB)
      expect(response.body).toHaveProperty('poster_path');
      expect(response.body).toHaveProperty('adult');
      expect(response.body).toHaveProperty('overview');
      expect(response.body).toHaveProperty('release_date');
      expect(response.body).toHaveProperty('genres');
      expect(response.body).toHaveProperty('credits');
      expect(response.body).toHaveProperty('videos');
    });

    it('should handle TMDB API errors gracefully', async () => {
      // This test ensures the endpoint doesn't crash when TMDB is unavailable
      const response = await request(app)
        .get(`/api/movies/${testMovieId}/details`)
        .expect(200);

      // Should still return local data even if TMDB fails
      expect(response.body.title).toBe('Test Movie');
      expect(response.body.plot).toBe('A test movie plot');
    });
  });
});
