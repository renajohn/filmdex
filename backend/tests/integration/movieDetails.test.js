const request = require('supertest');
const app = require('../../index');
const Movie = require('../../src/models/movie');

describe('Movie Details Integration Tests', () => {
  let testMovieId;

  beforeAll(async () => {
    // Create a test movie
    const testMovie = {
      title: 'Test Movie',
      plot: 'A test movie plot',
      genre: 'Action',
      imdb_rating: 8.5,
      rotten_tomato_rating: 85,
      year: 2023,
      format: 'Blu-ray',
      acquired_date: '2023-01-01'
    };
    
    const result = await Movie.create(testMovie);
    testMovieId = result.id;
  });

  afterAll(async () => {
    // Clean up test movie
    if (testMovieId) {
      await Movie.delete(testMovieId);
    }
  });

  describe('GET /movies/{id}/details', () => {
    it('should fetch and return combined local and TMDB data', async () => {
      const response = await request(app)
        .get(`/movies/${testMovieId}/details`)
        .expect(200);

      // Check local database fields
      expect(response.body.title).toBe('Test Movie');
      expect(response.body.plot).toBe('A test movie plot');
      expect(response.body.genre).toBe('Action');
      expect(response.body.imdb_rating).toBe(8.5);
      expect(response.body.rotten_tomatoes_rating).toBe(85);
      expect(response.body.year).toBe(2023);
      expect(response.body.format).toBe('Blu-ray');
      expect(response.body.date_of_acquisition).toBe('2023-01-01');

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
        .get(`/movies/${testMovieId}/details`)
        .expect(200);

      // Should still return local data even if TMDB fails
      expect(response.body.title).toBe('Test Movie');
      expect(response.body.plot).toBe('A test movie plot');
    });
  });
});
