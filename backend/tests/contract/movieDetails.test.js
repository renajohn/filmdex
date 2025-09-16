const request = require('supertest');
const app = require('../../index');

describe('Movie Details Contract Tests', () => {
  describe('GET /movies/{id}/details', () => {
    it('should return 200 with movie details when movie exists', async () => {
      // This test will fail initially as the endpoint doesn't exist yet
      const response = await request(app)
        .get('/movies/1/details')
        .expect(200);

      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('original_title');
      expect(response.body).toHaveProperty('original_language');
      expect(response.body).toHaveProperty('plot');
      expect(response.body).toHaveProperty('genre');
      expect(response.body).toHaveProperty('imdb_rating');
      expect(response.body).toHaveProperty('rotten_tomatoes_rating');
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
        .get('/movies/99999/details')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when id is not a valid number', async () => {
      const response = await request(app)
        .get('/movies/invalid/details')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
