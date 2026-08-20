import { defineConfig } from '@playwright/test';

// E2E against a running dev server with seeded DEMO data.
// Local: start the dev server (any port), then
//   E2E_BASE_URL=http://localhost:<port> npx playwright test
// Without E2E_BASE_URL a dev server is started on :3000 (fails fast if taken).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'de-DE',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
