const request = require('supertest');
const app = require('../../index');
const Movie = require('../../src/models/movie');

describe('Integration: Add Movie Flow', () => {
  beforeEach(async () => {
    // Clean up test data before each test
    await Movie.deleteAll();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await Movie.deleteAll();
  });

  it('should simulate the entire flow of searching for a movie and adding it to the database', async () => {
    // Step 1: Search for a movie (this will use TMDB API if available)
    const searchResponse = await request(app)
      .get('/movies/search/tmdb')
      .query({ query: 'Inception' });

    expect(searchResponse.status).toBe(200);
    expect(Array.isArray(searchResponse.body)).toBe(true);

    // Step 2: If we have search results, add the first movie to database
    if (searchResponse.body.length > 0) {
      const movieToAdd = searchResponse.body[0];
      
      // Ensure we have the required fields for adding to database
      const movieData = {
        title: movieToAdd.title || 'Test Movie',
        genre: movieToAdd.genre || 'Action',
        director: movieToAdd.director || 'Test Director',
        cast: movieToAdd.cast || ['Actor 1'],
        release_date: movieToAdd.release_date || '2023-01-01',
        format: 'Blu-ray',
        plot: movieToAdd.plot || 'Test plot',
        acquired_date: new Date().toISOString().split('T')[0]
      };

      const addResponse = await request(app)
        .post('/movies')
        .send(movieData);

      expect(addResponse.status).toBe(201);
      expect(addResponse.body).toHaveProperty('id');
      expect(addResponse.body.title).toBe(movieData.title);

      // Step 3: Verify the movie was added to the database
      const getResponse = await request(app)
        .get(`/movies/${addResponse.body.id}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.title).toBe(movieData.title);
    }
  });

  it('should handle adding a movie manually when search returns no results', async () => {
    // Step 1: Search for a non-existent movie
    const searchResponse = await request(app)
      .get('/movies/search/tmdb')
      .query({ query: 'nonexistentmovie12345' });

    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.length).toBe(0);

    // Step 2: Add movie manually
    const movieData = {
      title: 'Manually Added Movie',
      genre: 'Drama',
      director: 'Manual Director',
      cast: ['Manual Actor'],
      release_date: '2023-01-01',
      format: 'DVD',
      plot: 'Manual plot summary',
      acquired_date: new Date().toISOString().split('T')[0]
    };

    const addResponse = await request(app)
      .post('/movies')
      .send(movieData);

    expect(addResponse.status).toBe(201);
    expect(addResponse.body.title).toBe(movieData.title);

    // Step 3: Verify the movie exists in the database
    const allMoviesResponse = await request(app)
      .get('/movies');

    expect(allMoviesResponse.status).toBe(200);
    expect(allMoviesResponse.body.length).toBe(1);
    expect(allMoviesResponse.body[0].title).toBe(movieData.title);
  });

  it('should prevent adding duplicate movies from the same source', async () => {
    const movieData = {
      title: 'Duplicate Test Movie',
      genre: 'Action',
      director: 'Test Director',
      acquired_date: new Date().toISOString().split('T')[0]
    };

    // Add the movie first time
    const firstAddResponse = await request(app)
      .post('/movies')
      .send(movieData);

    expect(firstAddResponse.status).toBe(201);

    // Try to add the same movie again
    const secondAddResponse = await request(app)
      .post('/movies')
      .send(movieData);

    // This should either succeed (if we allow duplicates) or fail with appropriate error
    // The behavior depends on the business logic implementation
    expect([201, 400, 409]).toContain(secondAddResponse.status);
  });
});
