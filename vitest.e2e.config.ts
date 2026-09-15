import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.test.ts'],
    globalSetup: ['./e2e/global-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
