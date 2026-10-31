import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

// AIDEV-NOTE: Audit-only tooling is installed outside the app tree in the disposable Docker container.
mkdirSync('e2e/.pwa-results', { recursive: true })
for (const device of ['mobile', 'desktop']) {
  const output = `e2e/.pwa-results/lighthouse-${device}`
  execFileSync(process.execPath, [
    '/tmp/pwa-lighthouse/node_modules/lighthouse/cli/index.js', 'http://127.0.0.1:4180/',
    '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
    '--only-categories=performance,accessibility,best-practices', '--output=json', '--output=html',
    `--output-path=${output}`, ...(device === 'desktop' ? ['--preset=desktop'] : []),
  ], { env: { ...process.env, CHROME_PATH: chromium.executablePath() }, stdio: 'inherit' })
  const report = JSON.parse(readFileSync(`${output}.report.json`, 'utf8'))
  console.log(JSON.stringify({ device, version: report.lighthouseVersion,
    scores: Object.fromEntries(Object.entries(report.categories).map(([key, category]) => [key, category.score])),
    failures: Object.values(report.audits).filter((audit) => audit.score !== null && audit.score < 1)
      .map((audit) => ({ id: audit.id, title: audit.title, score: audit.score })),
  }))
}
