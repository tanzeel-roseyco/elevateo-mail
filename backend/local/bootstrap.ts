import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { applyMigration } from './migrations'
import { sha256 } from '../core'

// AIDEV-NOTE: Docker tooling is never imported by the Worker; only the separate fixture proxy provisions cookies.
export async function bootstrap(storage: string, initialize = true, consume = true, port = 0) {
  if (!existsSync('/.dockerenv')) throw new Error('Synthetic bootstrap must run inside Docker')
  const mf = new Miniflare({ ...convertV4MiniflareOptions({ scriptPath: 'dist/worker.js', modules: true,
    compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'],
    bindings: { PROVIDER_MODE: 'fake', LIVE_SENDING: 'disabled', DISPATCH_PAUSED: 'false', APPROVAL_TTL_SECONDS: '60' },
    d1Databases: { DB: 'integration-db' }, r2Buckets: ['FILES'], queueProducers: { SEND_QUEUE: 'integration-send' },
    ...(consume ? { queueConsumers: { 'integration-send': { maxBatchSize: 10, maxBatchTimeout: 1, maxRetries: 3 } } } : {}),
    host: '0.0.0.0', port }), resourcePersistencePath: storage })
  try {
    const env = await mf.getBindings<Env>()
    if (initialize) {
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)').run()
      for (const name of (await readdir('migrations')).filter(file => file.endsWith('.sql')).sort()) {
        if (await env.DB.prepare('SELECT name FROM local_migrations WHERE name=?').bind(name).first()) continue
        await applyMigration(env.DB, name, await readFile(`migrations/${name}`, 'utf8'))
      }
      const tokens = { alice: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''),
        bob: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '') }
      const expiresAt = Date.now() + 15 * 60_000
      for (const owner of ['alice', 'bob'] as const) {
        await env.DB.prepare('INSERT INTO users VALUES(?) ON CONFLICT DO NOTHING').bind(owner).run()
        await env.DB.prepare('DELETE FROM sessions WHERE owner=?').bind(owner).run()
        await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256(tokens[owner]), owner, expiresAt).run()
        const mailboxId = crypto.randomUUID()
        await env.DB.prepare(`INSERT INTO mailboxes(owner,id,provider,subject,address,send_enabled)
          VALUES(?,?,'fake',?,?,1) ON CONFLICT(owner,provider,subject) DO NOTHING`)
          .bind(owner, mailboxId, `fixture-${owner}`, `${owner}+pilot@example.com`).run()
        const mailbox = await env.DB.prepare('SELECT id FROM mailboxes WHERE owner=? AND subject=?')
          .bind(owner, `fixture-${owner}`).first<{ id: string }>()
        if (!mailbox) throw new Error('Fixture mailbox missing')
        for (let index = 0; index < 3; index++) await env.DB.prepare(`INSERT INTO messages
          (owner,mailbox_id,id,thread_id,sender,subject,body,at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`)
          .bind(owner, mailbox.id, `fixture-${index}`, `thread-${index}`, 'synthetic@example.com',
            `Synthetic ${index}`, '<b>Untrusted synthetic body</b>', 1_800_000_000_000).run()
      }
      await env.DB.prepare('UPDATE runtime_controls SET dispatch_paused=0 WHERE id=1').run()
      await mkdir(storage, { recursive: true })
      // Synthetic bearer values go to a private file, never diagnostic logs or API responses.
      await writeFile(resolve(storage, 'fixture-sessions.json'), JSON.stringify({ ...tokens, expiresAt }), { mode: 0o600 })
    }
    return { mf, env, url: (await mf.ready).toString(), close: () => mf.dispose() }
  } catch (error) { await mf.dispose(); throw error }
}
