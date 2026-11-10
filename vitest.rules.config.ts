import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

// Security Rules and service-integration suites. These talk to the Firebase emulators, so
// they must run under `firebase emulators:exec` (see the `test:rules` npm script), and files
// run one at a time because they share one emulator instance.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/rules/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
