import { defineConfig } from 'vitest/config';

// Unit tests run in Node; UI tests (src/app/**/*.test.tsx) opt into jsdom with a `// @vitest-environment jsdom` first line.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'sync/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
    // The jsdom flow tests on the real snapshot take several seconds each.
    testTimeout: 15000,
  },
});
