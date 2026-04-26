/* eslint-disable */
module.exports = {
  testEnvironment: 'node',
  rootDir: '../..',
  testMatch: ['<rootDir>/tests/mcp/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {}],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFiles: ['<rootDir>/tests/mcp/setupConfig.js'],
};
