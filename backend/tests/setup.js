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
  getApiKeys: () => ({ omdb: '', tmdb: '', discogs: 'test-token' }),
  getLogLevel: () => 'error',
  getMaxUploadMb: () => 20,
  getMaxUploadBytes: () => 20 * 1024 * 1024,
}));

// Wait for app initialization (database tables, migrations, etc.)
beforeAll(async () => {
  // index.ts is an ES module compiled to CJS, so the app lives under `.default`.
  const mod = require('../index');
  const app = mod.default || mod;
  if (app.serverReady) {
    await app.serverReady;
  }
});
