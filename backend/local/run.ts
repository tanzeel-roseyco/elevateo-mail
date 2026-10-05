import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { bootstrap } from './bootstrap'
import { MailHttpClient } from '../integration/client'
import { startBrowserFixture } from './browser'

// AIDEV-NOTE: This Docker-only demo uses a real HTTP socket and persisted D1; no production authentication exists.
const storage = resolve(process.env.FIXTURE_STORAGE ?? '/tmp/elevateo-fixture')
const local = await bootstrap(storage, true, true, 0)
let browser: Awaited<ReturnType<typeof startBrowserFixture>> | undefined
const close = async () => { await browser?.close(); await local.close(); process.exit(0) }
process.on('SIGINT', close); process.on('SIGTERM', close)
if (process.argv.includes('--demo')) {
  try {
    const session = z.object({ alice: z.string(), bob: z.string(), expiresAt: z.number() })
      .parse(JSON.parse(await readFile(resolve(storage, 'fixture-sessions.json'), 'utf8')) as unknown)
    const client = new MailHttpClient(local.url, session.alice)
    const mailbox = (await client.mailboxes()).items[0]!
    const intent = await client.create({ mailboxId: mailbox.id, to: ['synthetic@example.com'], cc: [], bcc: [],
      subject: 'Synthetic journey', body: 'No external email', kind: 'manual', revision: 1, idempotencyKey: crypto.randomUUID() })
    await client.approve(intent.id, intent.revision)
    let status = 'pending'
    for (let attempt = 0; attempt < 100 && status !== 'accepted'; attempt++) {
      status = (await client.inspect(intent.id)).intent.status
      if (status !== 'accepted') await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (status !== 'accepted') throw new Error('Simulated acceptance deadline exceeded')
    console.log(JSON.stringify({ simulated: true, status, quota: await client.quota(mailbox.id) }))
  } finally { await local.close() }
} else {
  try {
    browser = await startBrowserFixture(local, resolve(storage, 'fixture-sessions.json'), 8787)
    console.log('Synthetic browser API ready on container port 8787; cookie provisioning: POST /__fixture/session')
  } catch (error) { await local.close(); throw error }
}
