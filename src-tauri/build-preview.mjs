import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

// AIDEV-NOTE: Never let inherited API build settings turn the isolated preview into a broken live client.
const root = fileURLToPath(new URL('../', import.meta.url))
process.chdir(root)
process.env.VITE_BACKEND = 'demo'
process.env.VITE_DESKTOP_PREVIEW = 'true'
const icons = spawnSync(process.execPath, [
  'node_modules/@tauri-apps/cli/tauri.js', 'icon', 'public/logo.png', '--output', 'src-tauri/icons',
], { cwd: root, stdio: 'inherit' })
if (icons.error) throw icons.error
if (icons.status !== 0) throw new Error('Native preview icon generation failed')
const { build } = await import('vite')
await build({
  build: { outDir: 'dist' },
  plugins: [{
    name: 'offline-preview-title',
    transformIndexHtml: (html) => html.replace(/<title>[^<]*<\/title>/,
      '<title>Elevateo Mail — Offline preview</title>'),
  }],
})
