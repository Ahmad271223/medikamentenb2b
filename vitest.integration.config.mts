import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Integration suite — runs against the local dev database (docker compose,
// seeded DEMO data). Kept separate from `npm test` so the unit suite stays
// DB-free and fast. Run: npm run test:integration
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/integration/**/*.itest.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
