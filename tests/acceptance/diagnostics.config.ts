import { defineConfig } from '@playwright/test';

// AIDEV-NOTE: Synthetic runtime tests are separate from real-app acceptance and need no browser or credentials.
export default defineConfig({
  testDir: './playwright', testMatch: 'diagnostics.runtime.spec.ts', workers: 1, retries: 0, reporter: 'list',
});
