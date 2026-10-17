import { defineConfig, devices } from '@playwright/test'

// AIDEV-NOTE: Runs built production UI with controlled API replies inside the fleet Docker gate.
export default defineConfig({
  testDir: './e2e', testMatch: ['live-send.spec.ts', 'production.spec.ts'],
  outputDir: './e2e/.results/pilot', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'narrow-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 60_000 },
})
