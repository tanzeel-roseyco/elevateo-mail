import { defineConfig, devices } from '@playwright/test'

// R6 browser checks against the labelled fixture entry (no backend exists yet). Run only inside
// the pinned mcr.microsoft.com/playwright:v1.64.0-noble image; this config was not executed by
// the authoring agent.
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Design-review width (DESIGN-SPEC §7 step 6 pairs 1440 with 390).
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'narrow-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'reduced-motion', use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'reduce' } } },
  ],
  webServer: {
    command: 'npm run dev:fixtures -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/dev-fixtures.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
