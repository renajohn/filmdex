const request = require('supertest');
const app = require('../../index');
const path = require('path');
const fs = require('fs');

describe('POST /api/import/csv', () => {
  it('should accept a valid CSV file and return headers', async () => {
    // Create a temporary CSV file
    const csvContent = 'title,original_title,comments,price,format\n"Test Movie","Test Movie Original","Great film",19.99,"Blu-ray"';
    const csvPath = path.join(__dirname, 'test-import.csv');
    fs.writeFileSync(csvPath, csvContent);

    const response = await request(app)
      .post('/api/import/csv')
      .attach('file', csvPath)
      .expect(200);

    expect(response.body).toHaveProperty('headers');
    expect(response.body).toHaveProperty('filePath');
    expect(Array.isArray(response.body.headers)).toBe(true);
    expect(response.body.headers).toContain('title');
    expect(response.body.headers).toContain('original_title');

    // Clean up
    fs.unlinkSync(csvPath);
  });

  it('should reject non-CSV files', async () => {
    // Create a temporary text file
    const textContent = 'This is not a CSV file';
    const textPath = path.join(__dirname, 'test-import.txt');
    fs.writeFileSync(textPath, textContent);

    const response = await request(app)
      .post('/api/import/csv')
      .attach('file', textPath)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('CSV file');

    // Clean up
    fs.unlinkSync(textPath);
  });

  it('should reject files that are too large', async () => {
    // Create a large CSV file (simulate by creating a file larger than 10MB)
    const largeContent = 'title,original_title\n' + 
      Array(1000000).fill('"Very Long Movie Title","Very Long Original Title"').join('\n');
    const largePath = path.join(__dirname, 'test-large.csv');
    fs.writeFileSync(largePath, largeContent);

    const response = await request(app)
      .post('/api/import/csv')
      .attach('file', largePath)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('size');

    // Clean up
    fs.unlinkSync(largePath);
  });

  it('should reject requests without files', async () => {
    const response = await request(app)
      .post('/api/import/csv')
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('file');
  });
});

describe('POST /api/import/process', () => {
  it('should process CSV with column mapping and return import ID', async () => {
    // Create a temporary CSV file
    const csvContent = 'movie_title,original_name,notes,cost,media_type\n"Test Movie","Test Movie Original","Great film",19.99,"Blu-ray"';
    const csvPath = path.join(__dirname, 'test-process-mapping.csv');
    fs.writeFileSync(csvPath, csvContent);

    const columnMapping = {
      title: 'movie_title',
      original_title: 'original_name',
      comments: 'notes',
      price: 'cost',
      format: 'media_type'
    };

    const response = await request(app)
      .post('/api/import/process')
      .send({
        filePath: csvPath,
        columnMapping: columnMapping
      })
      .expect(202);

    expect(response.body).toHaveProperty('importId');
    expect(typeof response.body.importId).toBe('string');

    // Note: The file will be cleaned up by the service after processing
  });

  it('should reject requests without file path', async () => {
    const response = await request(app)
      .post('/api/import/process')
      .send({
        columnMapping: { title: 'movie_title' }
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('File path and column mapping are required');
  });

  it('should reject requests without column mapping', async () => {
    const response = await request(app)
      .post('/api/import/process')
      .send({
        filePath: '/some/path/file.csv'
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('File path and column mapping are required');
  });
});
