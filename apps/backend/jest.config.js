/**
 * @fileoverview Jest 설정
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 15000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/scheduler.js',
    '!src/config/env.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary'],
}
