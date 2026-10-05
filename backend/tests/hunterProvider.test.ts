import assert from 'node:assert/strict'
import test from 'node:test'
import { lookupHunter } from '../hunterProvider'

test('Hunter no-match, processing restriction, rate limit and malformed/oversized replies remain explicit without retries', async () => {
  let calls = 0
  const lookup = (status: number, body: unknown) => lookupHunter('client@example.com', 'synthetic', async () => {
    calls++; return Response.json(body, { status })
  })
  assert.equal(await lookup(404, {}), null)
  await assert.rejects(lookup(451, {}), /enrichment_restricted/u)
  await assert.rejects(lookup(429, {}), /enrichment_rate_limited/u)
  await assert.rejects(lookup(401, {}), /enrichment_key_rejected/u)
  await assert.rejects(lookup(200, { data: { location: 'x'.repeat(513) } }), /enrichment_unavailable/u)
  await assert.rejects(lookup(200, { data: { location: 'x'.repeat(70_000) } }), /enrichment_unavailable/u)
  assert.equal(calls, 6)
})
