/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.js', '**/*.test.js'],
  // 自动找 babel.config.js 转换 ESM
  moduleFileExtensions: ['js'],
  collectCoverageFrom: [
    'scripts/core/data-manager.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
}
