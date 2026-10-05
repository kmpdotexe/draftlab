import { defineConfig, devices } from '@playwright/test';

// Browser tests (Chromium only). Run from the repo root:
//   npm run e2e       build, serve dist/ with `vite preview` and run the gate tests (project "gate", app.e2e.ts)
//   npm run e2e:ci    the same against an existing dist/ (CI builds it in an earlier job)
//   npm run e2e:live  the smoke test (project "live", live.e2e.ts) against DRAFTLAB_URL, e.g. the deployed site
const live = process.env.DRAFTLAB_URL;
const PREVIEW_PORT = 4173;
const previewUrl = `http://localhost:${PREVIEW_PORT}/draftlab/`;

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  projects: [
    { name: 'gate', testMatch: 'app.e2e.ts', use: { baseURL: previewUrl } },
    { name: 'live', testMatch: 'live.e2e.ts' },
  ],
  // The preview server is only needed for the gate tests; with DRAFTLAB_URL set only the live test runs.
  webServer: live
    ? undefined
    : {
        command: `npx vite preview --port ${PREVIEW_PORT} --strictPort`,
        url: previewUrl,
        cwd: '..',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
