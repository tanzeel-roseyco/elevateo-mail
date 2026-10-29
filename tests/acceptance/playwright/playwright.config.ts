import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import { loadAcceptanceConfig } from '../shared/config.js';
import { browserName } from './boundaries.js';

// AIDEV-NOTE: One engine and one worker keep the shared lane/path immutable record identity unique.
const config = (() => {
  try { return loadAcceptanceConfig(); }
  catch { throw new Error('Acceptance configuration unavailable or invalid'); }
})();
if (config.baseURL !== 'http://app.test' || config.lane !== 'playwright_real'
  || config.profile !== 'internal_http') throw new Error('T1 requires internal real browser configuration');
export default defineConfig({
  testDir: '.', testMatch: /.*\.e2e\.ts$/, fullyParallel: false, workers: 1, retries: 0,
  timeout: config.limits.timeoutMs, expect: { timeout: 15000 },
  reporter: [['./quiet-reporter.ts']], outputDir: join(config.outputDir, 'native-private'),
  use: { baseURL: config.baseURL, browserName: browserName(process.env.ACCEPTANCE_BROWSER),
    // AIDEV-NOTE: The container must support Chromium namespaces; never silently disable its browser sandbox.
    launchOptions: { chromiumSandbox: true },
    viewport: { width: 1280, height: 800 }, trace: 'off', video: 'off', screenshot: 'off' },
});
