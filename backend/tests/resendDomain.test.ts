import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ResendDomainTransport } from '../providers/resendDomain'

const id = 'd91cd9bd-1176-453e-8fc1-35364d380206'
const evidence = { id, name: 'example.com', status: 'verified', capabilities: { sending: 'enabled' } }
// AIDEV-NOTE: Injected HTTP verifies provider boundaries without keys, DNS access or outbound network requests.
test('Resend domain evidence is bounded, read-only and normalized', async () => {
  const transport = new ResendDomainTransport(async (url, init) => {
    assert.equal(url, `https://api.resend.com/domains/${id}`)
    assert.equal(init.method, 'GET')
    assert.equal(init.redirect, 'error')
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer synthetic')
    return Response.json({ ...evidence, records: [] })
  })
  assert.deepEqual(await transport.verify('synthetic', id),
    { id, name: 'example.com', status: 'verified', sendingEnabled: true })
})
test('Resend domain errors, malformed evidence and oversized bodies fail closed', async () => {
  for (const response of [new Response('denied', { status: 403 }), Response.json({ ...evidence, id: crypto.randomUUID() }),
    Response.json({ ...evidence, capabilities: {} }), new Response('x'.repeat(65537))]) {
    await assert.rejects(new ResendDomainTransport(async () => response).verify('synthetic', id), /domain_verification_unavailable/u)
  }
})
test('Resend domain invalid request never fetches and disabled sending remains disabled', async () => {
  let calls = 0
  const transport = new ResendDomainTransport(async () => {
    calls++
    return Response.json({ ...evidence, status: 'pending', capabilities: { sending: 'disabled' } })
  })
  await assert.rejects(transport.verify('bad\r\nkey', id))
  await assert.rejects(transport.verify('synthetic', '../domains'))
  assert.equal(calls, 0)
  assert.deepEqual(await transport.verify('synthetic', id),
    { id, name: 'example.com', status: 'pending', sendingEnabled: false })
})
