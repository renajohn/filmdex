const request = require('supertest');
const app = require('../../index');
const MovieImport = require('../../src/models/movieImport');

describe('POST /api/import/resolve', () => {
  let testImportId;

  beforeEach(async () => {
    // Create a test import session
    const importSession = await MovieImport.create();
    testImportId = importSession.id;
  });

  it('should resolve a movie with valid data', async () => {
    const resolveData = {
      importId: testImportId,
      unmatchedMovieTitle: 'Test Movie',
      resolvedMovie: {
        title: 'Test Movie',
        original_title: 'Test Movie Original',
        release_date: '2023-01-01',
        genre: 'Action',
        director: 'Test Director',
        cast: ['Actor 1', 'Actor 2'],
        format: 'Blu-ray',
        price: 19.99,
        comments: 'Great movie',
        never_seen: false,
        acquired_date: '2023-12-01'
      }
    };

    const response = await request(app)
      .post('/api/import/resolve')
      .send(resolveData)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('movie');
    expect(response.body.movie).toHaveProperty('id');
    expect(response.body.movie).toHaveProperty('title', 'Test Movie');
    expect(response.body.movie).toHaveProperty('import_id', testImportId);
  });

  it('should return 400 for missing required fields', async () => {
    const incompleteData = {
      importId: testImportId,
      unmatchedMovieTitle: 'Test Movie'
      // missing resolvedMovie
    };

    const response = await request(app)
      .post('/api/import/resolve')
      .send(incompleteData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Missing required fields');
  });

  it('should return 400 for missing importId', async () => {
    const incompleteData = {
      unmatchedMovieTitle: 'Test Movie',
      resolvedMovie: {
        title: 'Test Movie'
      }
    };

    const response = await request(app)
      .post('/api/import/resolve')
      .send(incompleteData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Missing required fields');
  });

  it('should return 400 for missing unmatchedMovieTitle', async () => {
    const incompleteData = {
      importId: testImportId,
      resolvedMovie: {
        title: 'Test Movie'
      }
    };

    const response = await request(app)
      .post('/api/import/resolve')
      .send(incompleteData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Missing required fields');
  });
});
