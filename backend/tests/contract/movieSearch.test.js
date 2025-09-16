const request = require('supertest');
const app = require('../../index');

describe('GET /api/movies/search/tmdb', () => {
  it('should return 200 status code and array of movies when provided with valid query', async () => {
    const response = await request(app)
      .get('/movies/search/tmdb')
      .query({ query: 'Inception' });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('should return empty array when no movies found', async () => {
    const response = await request(app)
      .get('/movies/search/tmdb')
      .query({ query: 'nonexistentmovie12345' });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(0);
  });

  it('should return 400 when query parameter is missing', async () => {
    const response = await request(app)
      .get('/movies/search/tmdb');

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('should handle search with year parameter', async () => {
    const response = await request(app)
      .get('/movies/search/tmdb')
      .query({ query: 'Inception', year: '2010' });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
