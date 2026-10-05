import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { sha256 } from '../core'
import { SendLedger } from '../ledger'
import { draft, fixture, now, request, token } from '../tests/fixture'

// AIDEV-NOTE: Disposable fake-provider fixture only; this measures local D1 contention, never cloud CPU or cost.
const watchdog = setTimeout(() => { console.error('Pilot measurement exceeded ten minutes'); process.exit(124) }, 600_000)
const started = performance.now()
const f = await fixture()
let peakNodeRss = process.memoryUsage().rss
const sampler = setInterval(() => { peakNodeRss = Math.max(peakNodeRss, process.memoryUsage().rss) }, 100)
const samples: Record<string, number[]> = { create: [], approve: [], read: [] }
async function pool<T>(items: T[], concurrency: number, operation: (item: T) => Promise<void>) {
  let index = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) await operation(items[index++]!)
  }))
}
async function timed<T>(phase: string, operation: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try { return await operation() } finally { samples[phase]!.push(performance.now() - start) }
}
try {
  const owners = ['alice', 'bob', ...Array.from({ length: 8 }, (_, i) => `pilot${i}`)]
  const mailboxes = owners.flatMap(owner => Array.from({ length: 10 }, (_, i) => ({ owner, id: owner === 'alice' && i === 0 ? 'mail' : `${owner}-mail${i}` })))
  const tokens = new Map<string, string>([['alice', token]])
  for (const owner of owners) {
    if (owner !== 'alice' && owner !== 'bob') await f.env.DB.prepare('INSERT INTO users(id) VALUES(?)').bind(owner).run()
    if (owner !== 'alice') {
      const bearer = owner.padEnd(48, 'x'); tokens.set(owner, bearer)
      await f.env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256(bearer), owner, now + 86_400_000).run()
    }
  }
  for (const mailbox of mailboxes) {
    if (mailbox.id !== 'mail') await f.env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address,send_enabled) VALUES(?,?,'fake',?,?,1)")
      .bind(mailbox.owner, mailbox.id, mailbox.id, `${mailbox.id}@example.com`).run()
    await f.env.DB.batch(Array.from({ length: 100 }, (_, i) => f.env.DB.prepare('INSERT INTO messages(owner,mailbox_id,id,thread_id,sender,subject,body,at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(mailbox.owner, mailbox.id, `${mailbox.id}-message${i}`, `thread${i}`, 'sender@example.com', 'Synthetic pilot message', 'Synthetic body', now - i)))
  }
  const ledger = new SendLedger(f.env.DB)
  const jobs = mailboxes.flatMap(mailbox => Array.from({ length: 31 }, (_, i) => ({ ...mailbox, key: `${mailbox.id}-${i}` })))
  const intents: { owner: string; id: string; revision: string }[] = []
  await pool(jobs, 20, async job => {
    const intent = await timed('create', () => ledger.create(job.owner, { ...draft(job.key), mailboxId: job.id }, now))
    intents.push({ owner: job.owner, id: intent.id, revision: intent.revision })
  })
  let approved = 0; let quotaRejected = 0
  await pool(intents, 20, async intent => {
    await timed('approve', async () => {
      try { await ledger.approve(intent.owner, intent.id, intent.revision, now, 3_600_000); approved++ }
      catch (error) { if (!(error instanceof Error) || !error.message.includes('quota_exceeded')) throw error; quotaRejected++ }
    })
  })
  assert.equal(approved, 3000); assert.equal(quotaRejected, 100)
  const reservations = await f.env.DB.prepare("SELECT owner,mailbox_id,sum(status='pending') AS reserved,sum(status='draft') AS remaining FROM send_intents GROUP BY owner,mailbox_id").all<{ reserved: number; remaining: number }>()
  assert.equal(reservations.results.length, 100)
  for (const row of reservations.results) { assert.equal(row.reserved, 30); assert.equal(row.remaining, 1) }
  await pool(mailboxes, 10, async mailbox => {
    await timed('read', async () => {
      const response = await request(f.env, `/v1/messages?mailboxId=${mailbox.id}&limit=50`, 'GET', undefined, tokens.get(mailbox.owner)!)
      assert.equal(response.status, 200)
      const page = await response.json() as { items: { id: string; mailbox_id: string }[]; next: unknown }
      assert.equal(page.items.length, 50); assert.ok(page.next)
      assert.ok(page.items.every(item => item.mailbox_id === mailbox.id && item.id.startsWith(`${mailbox.id}-message`)))
      const foreign = await request(f.env, `/v1/messages/${mailbox.id}/${mailbox.id}-message0`, 'GET', undefined, tokens.get(mailbox.owner === 'alice' ? 'bob' : 'alice')!)
      assert.equal(foreign.status, 404)
    })
  })
  const latency = Object.fromEntries(Object.entries(samples).map(([phase, values]) => {
    values.sort((a, b) => a - b)
    return [phase, { count: values.length, p50Ms: values[Math.ceil(values.length * 0.5) - 1], p95Ms: values[Math.ceil(values.length * 0.95) - 1], maxMs: values.at(-1) }]
  }))
  console.log(JSON.stringify({ result: 'passed', owners: 10, mailboxes: 100, messages: 10000, approved, quotaRejected,
    elapsedMs: performance.now() - started, peakNodeRssBytes: peakNodeRss, latency,
    limitations: 'Local workerd/D1 fixture on shared Docker host; direct handler reads, no network/provider/cloud throughput or cost claim.' }, null, 2))
} finally { clearTimeout(watchdog); clearInterval(sampler); await f.close() }
