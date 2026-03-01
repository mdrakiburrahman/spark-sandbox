/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: false, tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(svg|png|jpg|jpeg|gif)$': '<rootDir>/src/__mocks__/fileMock.js',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/out/'],
  transformIgnorePatterns: ['/node_modules/(?!(@fluentui)/)'],
};

module.exports = config;
