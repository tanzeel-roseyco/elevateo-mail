import { defineConfig } from '@playwright/test';

// AIDEV-NOTE: Exercise the interception helper against a synthetic HTTP server, separate from product acceptance.
export default defineConfig({
  testDir: './playwright', testMatch: 'transport-barrier.runtime.spec.ts', workers: 1, retries: 0,
  reporter: 'list', timeout: 30000,
  use: { browserName: 'chromium', launchOptions: { chromiumSandbox: true } },
});
