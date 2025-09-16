const request = require('supertest');
const app = require('../../index');

describe('POST /api/movies', () => {
  it('should return 201 status code when valid movie object is provided', async () => {
    const movieData = {
      title: 'Test Movie',
      original_title: 'Original Test Movie',
      original_language: 'en',
      genre: 'Action',
      director: 'Test Director',
      cast: ['Actor 1', 'Actor 2'],
      release_date: '2023-01-01',
      format: 'Blu-ray',
      imdb_rating: 8.5,
      rotten_tomato_rating: 85,
      rotten_tomatoes_link: 'https://www.rottentomatoes.com/m/test_movie',
      imdb_link: 'https://www.imdb.com/title/tt1234567/',
      tmdb_link: 'https://www.themoviedb.org/movie/123456',
      tmdb_rating: 7.5,
      price: 19.99,
      runtime: 120,
      plot: 'Test plot summary',
      comments: 'Great movie!',
      never_seen: false,
      acquired_date: '2023-12-01'
    };

    const response = await request(app)
      .post('/movies')
      .send(movieData);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.title).toBe(movieData.title);
  });

  it('should return 400 when required fields are missing', async () => {
    const movieData = {
      genre: 'Action',
      director: 'Test Director'
      // Missing required title field
    };

    const response = await request(app)
      .post('/movies')
      .send(movieData);

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('should handle movie with minimal required data', async () => {
    const movieData = {
      title: 'Minimal Movie'
    };

    const response = await request(app)
      .post('/movies')
      .send(movieData);

    expect(response.status).toBe(201);
    expect(response.body.title).toBe(movieData.title);
  });

  it('should properly handle cast as array', async () => {
    const movieData = {
      title: 'Cast Test Movie',
      cast: ['Actor 1', 'Actor 2', 'Actor 3']
    };

    const response = await request(app)
      .post('/movies')
      .send(movieData);

    expect(response.status).toBe(201);
    expect(Array.isArray(response.body.cast)).toBe(true);
    expect(response.body.cast).toEqual(movieData.cast);
  });

  it('should handle new fields correctly', async () => {
    const movieData = {
      title: 'New Fields Test Movie',
      original_title: 'Original Title',
      original_language: 'fr',
      tmdb_link: 'https://www.themoviedb.org/movie/789',
      tmdb_rating: 8.0,
      runtime: 95,
      comments: 'Personal notes about this movie',
      never_seen: true
    };

    const response = await request(app)
      .post('/movies')
      .send(movieData);

    expect(response.status).toBe(201);
    expect(response.body.original_title).toBe(movieData.original_title);
    expect(response.body.original_language).toBe(movieData.original_language);
    expect(response.body.tmdb_link).toBe(movieData.tmdb_link);
    expect(response.body.tmdb_rating).toBe(movieData.tmdb_rating);
    expect(response.body.runtime).toBe(movieData.runtime);
    expect(response.body.comments).toBe(movieData.comments);
    expect(response.body.never_seen).toBe(movieData.never_seen);
  });
});
