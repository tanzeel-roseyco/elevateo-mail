import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

// AIDEV-NOTE: Hash final disk bytes after Vite rewrites preload dependencies; generateBundle bytes can still change.
export function pwaBuild(): Plugin {
  return {
    name: 'elevateo-private-pwa',
    apply: 'build',
    enforce: 'post',
    writeBundle(options) {
      const root = resolve(options.dir ?? 'dist')
      const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
      const html = readFileSync(resolve(root, 'index.html'))
      const shell = `/shell-${digest(html).slice(0, 16)}.html`
      writeFileSync(resolve(root, shell.slice(1)), html)
      const entries: { url: string; hash: string }[] = []
      for (const folder of ['assets', 'brand']) {
        for (const name of readdirSync(resolve(root, folder))) {
          // AIDEV-NOTE: Only runtime marks and install icons are needed offline; original brand masters are multi-megabyte.
          if (!(folder === 'brand' ? /^(elevateo-mark-(64|180)|pwa-(192|512|maskable-512|apple-180))\.png$/ : /\.(js|css|woff2?|png|svg)$/).test(name)) continue
          entries.push({ url: `/${folder}/${name}`, hash: digest(readFileSync(resolve(root, folder, name))) })
        }
      }
      entries.push({ url: shell, hash: digest(html) })
      const template = readFileSync(new URL('./worker.js', import.meta.url), 'utf8')
      const version = digest(template + JSON.stringify(entries)).slice(0, 16)
      writeFileSync(resolve(root, 'sw.js'), template
        .replace('__ENTRIES__', JSON.stringify(entries))
        .replace('__SHELL__', JSON.stringify(shell))
        .replace('__VERSION__', JSON.stringify(version)))
    },
  }
}
