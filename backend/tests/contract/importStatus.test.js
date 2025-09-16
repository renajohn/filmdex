const request = require('supertest');
const app = require('../../index');
const MovieImport = require('../../src/models/movieImport');

describe('GET /api/import/:id', () => {
  let testImportId;

  beforeEach(async () => {
    // Create a test import session
    const importSession = await MovieImport.create();
    testImportId = importSession.id;
  });

  it('should return import status for valid import ID', async () => {
    const response = await request(app)
      .get(`/api/import/${testImportId}`)
      .expect(200);

    expect(response.body).toHaveProperty('id', testImportId);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('createdAt');
    expect(response.body).toHaveProperty('updatedAt');
    expect(response.body).toHaveProperty('unmatchedMovies');
    expect(Array.isArray(response.body.unmatchedMovies)).toBe(true);
  });

  it('should return 404 for non-existent import ID', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    
    const response = await request(app)
      .get(`/api/import/${nonExistentId}`)
      .expect(404);

    expect(response.body).toHaveProperty('error', 'Import not found');
  });

  it('should return 404 for invalid import ID format', async () => {
    const invalidId = 'invalid-id-format';
    
    const response = await request(app)
      .get(`/api/import/${invalidId}`)
      .expect(404);

    expect(response.body).toHaveProperty('error', 'Import not found');
  });
});
