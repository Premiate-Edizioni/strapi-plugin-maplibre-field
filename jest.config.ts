import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    'maplibre-gl/dist/maplibre-gl.css': 'identity-obj-proxy',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        rootDir: '.',
        esModuleInterop: true,
        skipLibCheck: true,
      },
    }],
  },
  testMatch: ['**/tests/**/*.test.ts?(x)'],
};

export default config;
