import { defineConfig } from '@playwright/test'

// AIDEV-NOTE: Runs the API-backed build against the real server (integration/compose.yaml). One worker, in order:
// the tests share one server and switch its outage and pause controls, so they must not overlap.
export default defineConfig({
  testDir: 'e2e-integration',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4174', browserName: 'chromium' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', testMatch: /visual\.spec\.ts/, use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: { command: 'npm run preview:api', url: 'http://127.0.0.1:4174', reuseExistingServer: false, timeout: 60_000 },
})
