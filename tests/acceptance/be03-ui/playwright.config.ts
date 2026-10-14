import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: 'send.spec.ts', workers: 1, retries: 0,
  outputDir: '/output/browser', reporter: [['json', { outputFile: '/output/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:18142', browserName: 'chromium', headless: true,
    launchOptions: { executablePath: process.env.BE03_CHROMIUM_PATH }, trace: 'off' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 } } },
  ],
})
