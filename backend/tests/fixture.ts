import { readFile, readdir } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { sha256 } from '../core'
import { handleRequest } from '../worker'

// AIDEV-NOTE: Integration tests use workerd's real D1 binding, not a mock SQL interpreter.
export const now = 1_800_000_000_000
export const token = 'a'.repeat(48)
export async function fixture(persist?: string, initialize = true): Promise<{ env: Env; close: () => Promise<void> }> {
  const mf = new Miniflare({ ...convertV4MiniflareOptions({ scriptPath: 'dist/worker.js', modules: true, compatibilityDate: '2026-10-01',
    compatibilityFlags: ['nodejs_compat'], bindings: { PROVIDER_MODE: 'fake', LIVE_SENDING: 'disabled', DISPATCH_PAUSED: 'false' },
    d1Databases: { DB: 'test-db' },
    r2Buckets: ['FILES'], queueProducers: { SEND_QUEUE: 'test-send' } }),
    ...(persist ? { resourcePersistencePath: persist } : {}) })
  try {
  const env = await mf.getBindings<Env>()
  if (!initialize) return { env, close: () => mf.dispose() }
  for (const file of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(`migrations/${file}`, 'utf8')
    // Triggers contain internal semicolons. Feed complete statements individually to D1 prepare.
    let statement = ''
    for (const line of sql.split('\n')) {
      if (line.trim().startsWith('--') || !line.trim()) continue
      statement += `${line}\n`
      const trigger = statement.trim().startsWith('CREATE TRIGGER')
      const triggerEnd = line.trim() === 'END;' || (line.trim().startsWith('BEGIN ') && line.trim().endsWith('END;'))
      if (trigger ? triggerEnd : line.trim().endsWith(';')) {
        await env.DB.prepare(statement).run(); statement = ''
      }
    }
    if (statement.trim()) throw new Error(`Incomplete migration: ${file}`)
  }
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users VALUES('alice'),('bob')"),
    env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256(token), 'alice', now + 86_400_000),
    env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address,send_enabled) VALUES('alice','mail','fake','subject','alice@example.com',1)"),
    env.DB.prepare('UPDATE runtime_controls SET dispatch_paused=0 WHERE id=1'),
  ])
  return { env, close: () => mf.dispose() }
  } catch (error) { await mf.dispose(); throw error }
}
export function request(env: Env, path: string, method = 'GET', body?: unknown, bearer = token): Promise<Response> {
  return handleRequest(new Request(`https://backend.test${path}`, { method,
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, now)
}
export function draft(key: string, count = 1, kind: 'manual' | 'campaign' | 'ai' = 'manual') {
  return { mailboxId: 'mail', to: Array.from({ length: count }, (_, index) => `recipient${index}@example.com`),
    cc: [], bcc: [], subject: 'Hello', body: 'Plain text', kind, revision: 1, idempotencyKey: key,
    ...(kind === 'campaign' ? { campaignId: 'campaign' } : {}) }
}
