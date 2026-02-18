/** @type {import('jest').Config} */
export default {
  testMatch: [
    '<rootDir>/tests/**/*.test.cjs',
    '<rootDir>/tests/**/*.test.ts',
  ],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: '<rootDir>/tests/tsconfig.json',
      },
    ],
  },
};
