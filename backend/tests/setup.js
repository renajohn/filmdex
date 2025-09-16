const { initDatabase } = require('../src/database');
const Movie = require('../src/models/movie');
const MovieImport = require('../src/models/movieImport');

// Setup test database
beforeAll(async () => {
  await initDatabase();
  await Movie.createTable();
  await MovieImport.createTable();
  await MovieCast.createTable();
  await MovieCrew.createTable();
});

// Clean up after each test
afterEach(async () => {
  await Movie.deleteAll();
  // Note: MovieImport doesn't have deleteAll, but in real tests you'd clean up
});

// Close database connections after all tests
afterAll(async () => {
  // The database connection will be closed when the process exits
});
