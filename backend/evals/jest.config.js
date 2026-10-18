// The evalsets score the vision model against a live LLM server: apart from
// `npm test`, which must stay offline and green, and run by `npm run eval`.
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/evals/**/*.eval.js'],
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
