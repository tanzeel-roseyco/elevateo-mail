// Fails when the production entry (main) chunk exceeds the 500 KB minified budget (BOLT web-quality
// gate). Reads the Vite manifest (build.manifest) to find the entry chunk deterministically, then
// measures that chunk's own emitted file on disk — minified bytes, not gzip. Route and vendor chunks
// load on demand or in parallel and are intentionally NOT counted against the entry budget.
//
// AIDEV-NOTE: Run after `vite build`. The production build emits a single isEntry chunk (index.html);
// dev/fixtures/demo builds emit more, so this still checks every entry it finds.
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUDGET_BYTES = 500 * 1024
const webRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distDir = join(webRoot, 'dist')
const manifestPath = join(distDir, '.vite', 'manifest.json')

let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (error) {
  console.error(`check:bundle could not read the Vite manifest at ${manifestPath}. Run \`vite build\` first.`)
  console.error(String(error))
  process.exit(1)
}

const entries = Object.values(manifest).filter((chunk) => chunk && chunk.isEntry === true && typeof chunk.file === 'string')
if (entries.length === 0) {
  console.error('check:bundle found no entry chunk in the Vite manifest.')
  process.exit(1)
}

let failed = false
for (const entry of entries) {
  const bytes = statSync(join(distDir, entry.file)).size
  const kb = (bytes / 1024).toFixed(1)
  const ok = bytes <= BUDGET_BYTES
  console.log(`${ok ? 'OK  ' : 'OVER'} entry ${entry.file}: ${kb} KB (budget 500.0 KB)`)
  if (!ok) failed = true
}

if (failed) {
  console.error('check:bundle failed: the entry chunk is over the 500 KB budget. Split more routes with React.lazy.')
  process.exit(1)
}
console.log('check:bundle passed: every entry chunk is within the 500 KB budget.')
