// Fails when the production entry (main) chunk exceeds the 500 KB minified budget, or when the
// "initial JS" (the entry chunk plus every chunk reachable through static `imports`) exceeds 900 KB
// (BOLT web-quality gate). Reads the Vite manifest (build.manifest) to find the entry chunk
// deterministically, then measures the emitted files on disk — minified bytes, not gzip. Chunks
// reached only through `dynamicImports` (routes behind React.lazy) load on demand and are
// intentionally NOT counted against either budget.
//
// AIDEV-NOTE: Run after `vite build`. The production build emits a single isEntry chunk (index.html);
// dev/fixtures/demo builds emit more, so this still checks every entry it finds.
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENTRY_BUDGET_BYTES = 500 * 1024
const INITIAL_BUDGET_BYTES = 900 * 1024
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

const entries = Object.entries(manifest).filter(([, chunk]) => chunk && chunk.isEntry === true && typeof chunk.file === 'string')
if (entries.length === 0) {
  console.error('check:bundle found no entry chunk in the Vite manifest.')
  process.exit(1)
}

const kb = (bytes) => (bytes / 1024).toFixed(1)
const sizeOf = (chunk) => statSync(join(distDir, chunk.file)).size

/**
 * Every manifest key reachable from `entryKey` through static `imports` (including itself). Static
 * imports form the graph the browser must download before the entry module can execute; a visited
 * set guards against import cycles, which Rollup can emit between shared chunks.
 */
function collectInitialChunks(manifestObject, entryKey) {
  const seen = new Set()
  const stack = [entryKey]
  while (stack.length > 0) {
    const key = stack.pop()
    if (seen.has(key)) continue
    const chunk = manifestObject[key]
    if (!chunk || typeof chunk.file !== 'string') continue
    seen.add(key)
    for (const dependency of chunk.imports ?? []) stack.push(dependency)
  }
  return [...seen]
}

let failed = false
for (const [key, entry] of entries) {
  const entryBytes = sizeOf(entry)
  const entryOk = entryBytes <= ENTRY_BUDGET_BYTES
  console.log(`${entryOk ? 'OK  ' : 'OVER'} entry ${entry.file}: ${kb(entryBytes)} KB (budget ${kb(ENTRY_BUDGET_BYTES)} KB)`)
  if (!entryOk) failed = true

  const initialKeys = collectInitialChunks(manifest, key)
  const initialBytes = initialKeys.reduce((total, chunkKey) => total + sizeOf(manifest[chunkKey]), 0)
  const initialOk = initialBytes <= INITIAL_BUDGET_BYTES
  console.log(`${initialOk ? 'OK  ' : 'OVER'} initial JS for ${entry.file}: ${kb(initialBytes)} KB across ${initialKeys.length} chunk(s) (budget ${kb(INITIAL_BUDGET_BYTES)} KB)`)
  if (!initialOk) failed = true
}

if (failed) {
  console.error('check:bundle failed: the entry chunk is over 500 KB or the initial JS (entry + static imports) is over 900 KB. Split more routes with React.lazy.')
  process.exit(1)
}
console.log('check:bundle passed: every entry chunk is within the 500 KB budget and its initial JS within 900 KB.')
