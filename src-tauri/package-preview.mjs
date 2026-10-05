import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

// AIDEV-NOTE: Native bundlers must run on their target OS; never disguise a cross-built fixture as an installer.
const config = { win32: 'tauri.windows.conf.json', darwin: 'tauri.macos.conf.json' }[process.platform]
if (!config) throw new Error('Preview installers require Windows or macOS on the build machine.')
const root = fileURLToPath(new URL('../', import.meta.url))
const env = { ...process.env }
// Ad-hoc signing permits a local macOS test artifact; it is not developer signing or notarisation.
if (process.platform === 'darwin') env.APPLE_SIGNING_IDENTITY = '-'
for (const key of ['APPLE_API_KEY', 'APPLE_API_ISSUER', 'APPLE_API_KEY_PATH', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']) delete env[key]
const result = spawnSync(process.execPath, [
  'node_modules/@tauri-apps/cli/tauri.js', 'build', '--config', `src-tauri/${config}`, '--', '--locked',
], { cwd: root, env, stdio: 'inherit', shell: false })
if (result.error) throw result.error
if (result.status !== 0) throw new Error(`Preview installer build failed (${result.status ?? result.signal}).`)
