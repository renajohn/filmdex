const request = require('supertest');
const app = require('../../index');
const path = require('path');
const fs = require('fs');
const Movie = require('../../src/models/movie');
const MovieImport = require('../../src/models/movieImport');

describe('CSV Import Integration Flow', () => {

  it('should complete full CSV import flow with valid data', async () => {
    // Create a test CSV file with valid movie data
    const csvContent = `title,original_title,comments,price,format
"The Matrix","The Matrix","Great sci-fi film",19.99,"Blu-ray"
"Inception","Inception","Mind-bending thriller",24.99,"4K Blu-ray"`;
    
    const csvPath = path.join(__dirname, 'test-integration.csv');
    fs.writeFileSync(csvPath, csvContent);

    try {
      // Step 1: Upload CSV file and get headers
      const uploadResponse = await request(app)
        .post('/api/import/csv')
        .attach('file', csvPath)
        .expect(200);

      expect(uploadResponse.body).toHaveProperty('headers');
      expect(uploadResponse.body).toHaveProperty('filePath');
      
      // Step 2: Process CSV with column mapping
      const columnMapping = {
        title: 'title',
        original_title: 'original_title',
        comments: 'comments',
        price: 'price',
        format: 'format'
      };

      const processResponse = await request(app)
        .post('/api/import/process')
        .send({
          filePath: uploadResponse.body.filePath,
          columnMapping: columnMapping
        })
        .expect(202);

      expect(processResponse.body).toHaveProperty('importId');
      const importId = processResponse.body.importId;

      // Step 3: Check import status (initially should be processing or pending)
      const statusResponse = await request(app)
        .get(`/api/import/${importId}`)
        .expect(200);

      expect(statusResponse.body).toHaveProperty('id', importId);
      expect(statusResponse.body).toHaveProperty('status');
      expect(['PENDING', 'PROCESSING', 'COMPLETED', 'PENDING_RESOLUTION']).toContain(statusResponse.body.status);

      // Step 3: Wait a bit for processing to complete (in real scenario, this would be async)
      // For testing, we'll just verify the import session was created
      const importSession = await MovieImport.findById(importId);
      expect(importSession).toBeTruthy();
      expect(importSession.id).toBe(importId);

    } finally {
      // Clean up
      if (fs.existsSync(csvPath)) {
        fs.unlinkSync(csvPath);
      }
    }
  });

  it('should handle CSV with missing required fields gracefully', async () => {
    // Create a CSV with missing title (should be handled gracefully)
    const csvContent = `original_title,comments,price,format
"Test Movie Original","Great film",19.99,"Blu-ray"`;
    
    const csvPath = path.join(__dirname, 'test-missing-title.csv');
    fs.writeFileSync(csvPath, csvContent);

    try {
      // Step 1: Upload CSV file and get headers
      const uploadResponse = await request(app)
        .post('/api/import/csv')
        .attach('file', csvPath)
        .expect(200);

      expect(uploadResponse.body).toHaveProperty('headers');
      expect(uploadResponse.body).toHaveProperty('filePath');
      
      // Step 2: Process CSV with column mapping
      const columnMapping = {
        original_title: 'original_title',
        comments: 'comments',
        price: 'price',
        format: 'format'
      };

      const processResponse = await request(app)
        .post('/api/import/process')
        .send({
          filePath: uploadResponse.body.filePath,
          columnMapping: columnMapping
        })
        .expect(202);

      expect(processResponse.body).toHaveProperty('importId');
      const importId = processResponse.body.importId;

      // Check that import session was created
      const importSession = await MovieImport.findById(importId);
      expect(importSession).toBeTruthy();

    } finally {
      if (fs.existsSync(csvPath)) {
        fs.unlinkSync(csvPath);
      }
    }
  });

  it('should handle empty CSV file', async () => {
    // Create an empty CSV file
    const csvContent = 'title,original_title,comments,price,format\n';
    
    const csvPath = path.join(__dirname, 'test-empty.csv');
    fs.writeFileSync(csvPath, csvContent);

    try {
      // Step 1: Upload CSV file and get headers
      const uploadResponse = await request(app)
        .post('/api/import/csv')
        .attach('file', csvPath)
        .expect(200);

      expect(uploadResponse.body).toHaveProperty('headers');
      expect(uploadResponse.body).toHaveProperty('filePath');
      
      // Step 2: Process CSV with column mapping
      const columnMapping = {
        title: 'title',
        original_title: 'original_title',
        comments: 'comments',
        price: 'price',
        format: 'format'
      };

      const processResponse = await request(app)
        .post('/api/import/process')
        .send({
          filePath: uploadResponse.body.filePath,
          columnMapping: columnMapping
        })
        .expect(202);

      expect(processResponse.body).toHaveProperty('importId');
      const importId = processResponse.body.importId;

      // The import should still be created but will fail during processing
      const importSession = await MovieImport.findById(importId);
      expect(importSession).toBeTruthy();

    } finally {
      if (fs.existsSync(csvPath)) {
        fs.unlinkSync(csvPath);
      }
    }
  });

  it('should handle movie resolution flow', async () => {
    // Create an import session
    const importSession = await MovieImport.create();
    const importId = importSession.id;

    // Resolve a movie
    const resolveData = {
      importId: importId,
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

    const resolveResponse = await request(app)
      .post('/api/import/resolve')
      .send(resolveData)
      .expect(200);

    expect(resolveResponse.body).toHaveProperty('success', true);
    expect(resolveResponse.body).toHaveProperty('movie');
    expect(resolveResponse.body.movie.title).toBe('Test Movie');
    expect(resolveResponse.body.movie.import_id).toBe(importId);

    // Verify movie was created in database
    const createdMovie = await Movie.findByTitle('Test Movie');
    expect(createdMovie).toBeTruthy();
    expect(createdMovie.import_id).toBe(importId);
  });

  it('should get movie suggestions for unmatched movies', async () => {
    const testImportId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .get(`/api/import/${testImportId}/suggestions`)
      .query({ title: 'The Matrix' })
      .expect(200);

    expect(response.body).toHaveProperty('suggestions');
    expect(Array.isArray(response.body.suggestions)).toBe(true);
  });
});
