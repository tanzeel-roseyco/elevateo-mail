import { defineConfig, devices } from '@playwright/test'
// Browser checks against the labelled fixture entry and optional served production artifact.
// AIDEV-NOTE: Run in pinned Playwright Docker; intercepted API tests do not prove backend integration.
// AIDEV-NOTE: Only specs that read testInfo.project.name (viewport/motion evidence) run under the
// three alternate projects; everything else runs once on `desktop`. VIEWPORT_SPECS lives in
// e2e/viewport-specs.ts so a unit test can assert no spec drifts out of it.
import { VIEWPORT_SPECS } from './e2e/viewport-specs'

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Evidence screenshots are explicit page.screenshot calls in the specs; automatic captures
    // are kept only for failures so passing runs do not write one PNG per test per project.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Design-review width (DESIGN-SPEC §7 step 6 pairs 1440 with 390).
    { name: 'desktop-1440', testMatch: VIEWPORT_SPECS, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'narrow-390', testMatch: VIEWPORT_SPECS, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'reduced-motion', testMatch: VIEWPORT_SPECS, use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'reduce' } } },
  ],
  webServer: {
    command: 'npm run dev:fixtures -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/dev-fixtures.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
