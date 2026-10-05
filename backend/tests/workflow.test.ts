import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker, { relay } from '../worker'
import { draft, fixture, now, token } from './fixture'

// AIDEV-NOTE: Exercise HTTP approval through relay and queue; no live provider or desktop timer participates.
test('HTTP draft and approval flow through relay and queue to simulated acceptance', async () => {
  const f = await fixture()
  const clock = Date.now
  try {
    Date.now = () => now
    const http = (path: string, body?: unknown) => worker.fetch(new Request(`https://backend.test${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), f.env)
    const created = await http('/v1/send-intents', draft('workflow'))
    assert.equal(created.status, 201)
    assert.equal(created.headers.get('cache-control'), 'no-store')
    assert.equal(created.headers.get('x-content-type-options'), 'nosniff')
    const intent = await created.json() as { id: string; revision: string }
    assert.equal((await http(`/v1/send-intents/${intent.id}/approve`, { revision: intent.revision })).status, 200)
    const jobs: unknown[] = []
    const observed: Env = { ...f.env, SEND_QUEUE: { ...f.env.SEND_QUEUE,
      send: async body => { jobs.push(body); return { metadata: { metrics: { backlogCount: jobs.length, backlogBytes: 0 } } } },
    } }
    await relay(observed, now)
    assert.equal(jobs.length, 1)
    let acknowledgements = 0
    const message: Message<unknown> = { body: jobs[0], id: 'workflow', timestamp: new Date(now), attempts: 1,
      ack: () => { acknowledgements++ }, retry: () => { throw new Error('eligible fake send must succeed') } }
    const batch: MessageBatch<unknown> = { queue: 'test-send', messages: [message],
      metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } }, ackAll() {}, retryAll() {} }
    await worker.queue(batch, f.env)
    await worker.queue(batch, f.env)
    assert.equal(acknowledgements, 2)
    const status = await (await http(`/v1/send-intents/${intent.id}`)).json() as { intent: { status: string }; simulated: boolean }
    assert.equal(status.intent.status, 'accepted'); assert.equal(status.simulated, true)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first())?.n, 1)
  } finally { Date.now = clock; await f.close() }
})
