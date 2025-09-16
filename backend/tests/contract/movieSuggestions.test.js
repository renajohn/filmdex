const request = require('supertest');
const app = require('../../index');

describe('GET /api/import/:id/suggestions', () => {
  const testImportId = '00000000-0000-0000-0000-000000000000';

  it('should return movie suggestions for valid title', async () => {
    const response = await request(app)
      .get(`/api/import/${testImportId}/suggestions`)
      .query({ title: 'The Matrix' })
      .expect(200);

    expect(response.body).toHaveProperty('suggestions');
    expect(Array.isArray(response.body.suggestions)).toBe(true);
    
    if (response.body.suggestions.length > 0) {
      const suggestion = response.body.suggestions[0];
      expect(suggestion).toHaveProperty('id');
      expect(suggestion).toHaveProperty('title');
      expect(suggestion).toHaveProperty('originalTitle');
      expect(suggestion).toHaveProperty('releaseDate');
      expect(suggestion).toHaveProperty('posterPath');
      expect(suggestion).toHaveProperty('overview');
      expect(suggestion).toHaveProperty('voteAverage');
    }
  });

  it('should return movie suggestions with year filter', async () => {
    const response = await request(app)
      .get(`/api/import/${testImportId}/suggestions`)
      .query({ title: 'The Matrix', year: '1999' })
      .expect(200);

    expect(response.body).toHaveProperty('suggestions');
    expect(Array.isArray(response.body.suggestions)).toBe(true);
  });

  it('should return 400 for missing title parameter', async () => {
    const response = await request(app)
      .get(`/api/import/${testImportId}/suggestions`)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Title parameter is required');
  });

  it('should return empty suggestions for non-existent movie', async () => {
    const response = await request(app)
      .get(`/api/import/${testImportId}/suggestions`)
      .query({ title: 'NonExistentMovie12345' })
      .expect(200);

    expect(response.body).toHaveProperty('suggestions');
    expect(Array.isArray(response.body.suggestions)).toBe(true);
    expect(response.body.suggestions).toHaveLength(0);
  });
});
