import { chromium, defineConfig } from '@playwright/test'

// AIDEV-NOTE: This suite serves dist in a Docker browser, never Vite's dev/fixture entry.
export default defineConfig({
  testDir: './e2e/pwa',
  workers: 1,
  timeout: 45_000,
  outputDir: './e2e/.pwa-results',
  reporter: [['list'], ['json', { outputFile: './e2e/.pwa-results/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4180', launchOptions: { executablePath: chromium.executablePath() }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node e2e/pwa/server.mjs', url: 'http://127.0.0.1:4180', reuseExistingServer: false },
})
