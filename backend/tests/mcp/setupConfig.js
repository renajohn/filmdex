// Mock the configManager BEFORE any test code or imports run, so that loading
// any module which transitively imports config gets the in-memory test config.
process.env.NODE_ENV = 'test';

jest.mock('../../src/config', () => ({
  loadDeploymentConfig: () => ({}),
  loadDataConfig: () => ({}),
  getDeploymentConfig: () => ({}),
  getDataConfig: () => ({}),
  getDatabasePath: () => ':memory:',
  getDataPath: () => '/tmp/dexvault-mcp-test',
  getImagesPath: () => '/tmp/dexvault-mcp-test/images',
  getEbooksPath: () => '/tmp/dexvault-mcp-test/ebooks',
  getApiKeys: () => ({ omdb: '', tmdb: '' }),
  getLogLevel: () => 'error',
  getMaxUploadMb: () => 20,
  getMaxUploadBytes: () => 20 * 1024 * 1024,
}));
