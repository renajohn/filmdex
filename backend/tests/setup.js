// Set test environment
process.env.NODE_ENV = 'test';

jest.mock('../src/config', () => ({
  loadDeploymentConfig: () => ({}),
  loadDataConfig: () => ({}),
  getDeploymentConfig: () => ({}),
  getDataConfig: () => ({}),
  getDatabasePath: () => ':memory:',
  getDataPath: () => '/tmp/dexvault-test',
  getImagesPath: () => '/tmp/dexvault-test/images',
  getEbooksPath: () => '/tmp/dexvault-test/ebooks',
  getApiKeys: () => ({ omdb: '', tmdb: '' }),
  getLogLevel: () => 'error',
  getMaxUploadMb: () => 20,
  getMaxUploadBytes: () => 20 * 1024 * 1024,
}));

// Wait for app initialization (database tables, migrations, etc.)
beforeAll(async () => {
  const app = require('../index');
  if (app.serverReady) {
    await app.serverReady;
  }
});
