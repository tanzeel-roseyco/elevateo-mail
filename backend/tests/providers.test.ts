import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GmailProvider } from '../providers/gmail'
import { ResendProvider } from '../providers/resend'
import { FakeProvider } from '../providers/fake'
import { providerRequest } from '../providers/http'
import type { SendEnvelope } from '../providers/ports'

// AIDEV-NOTE: Adapter activation is exercised only through injected fetch; tests cannot contact mail providers.
const envelope: SendEnvelope = { id: 'intent', owner: 'alice', mailboxId: 'mail', from: 'alice@example.com',
  to: ['to@example.com'], cc: [], bcc: ['private@example.com'], subject: 'Hello', body: 'Body', kind: 'manual', revision: 'a'.repeat(64) }
test('live adapters default disabled and fake ambiguity is reconcilable', async () => {
  const forbidden = async (): Promise<Response> => { throw new Error('network must not be used') }
  assert.deepEqual(await new GmailProvider('fake', false, forbidden).send(envelope), { status: 'rejected', code: 'live_disabled' })
  assert.deepEqual(await new ResendProvider('fake', 'alice@example.com', false, forbidden).send(envelope), { status: 'rejected', code: 'live_disabled' })
  const fake = new FakeProvider('ambiguous')
  assert.equal((await fake.send(envelope)).status, 'unknown')
  assert.equal((await fake.reconcile(envelope)).status, 'accepted')
})
test('Gmail folds long UTF8 headers and encodes BCC in MIME without overflow', async () => {
  let calls = 0
  const gmail = new GmailProvider('fake', true, async (_url, init) => {
    calls++
    const body = JSON.parse(String(init.body)) as { raw: string }
    const mime = Buffer.from(body.raw, 'base64url').toString('utf8')
    assert.ok(mime.includes('Bcc: private@example.com'))
    assert.ok(mime.split('\r\n').every(line => Buffer.byteLength(line) <= 998))
    assert.ok([...mime.matchAll(/=\?UTF-8\?B\?[^?]+\?=/gu)].every(word => word[0].length <= 75))
    return Response.json({ id: 'gmail-id' })
  })
  assert.equal((await gmail.send({ ...envelope, subject: '😀'.repeat(499), body: '😀'.repeat(25000) })).status, 'accepted')
  assert.equal(calls, 1)
  assert.equal((await gmail.reconcile()).status, 'unknown')
})
test('provider acceptance, definitive rejection and ambiguous responses differ', async () => {
  const campaign = { ...envelope, bcc: [], kind: 'campaign' as const }
  const resend = (status: number, body: unknown) => new ResendProvider('fake', envelope.from, true,
    async (_url, init) => {
      assert.equal(new Headers(init.headers).get('Idempotency-Key'), envelope.id)
      assert.deepEqual((JSON.parse(String(init.body)) as { tags: unknown }).tags, [{ name: 'elevateo_intent_id', value: envelope.id }])
      return Response.json(body, { status })
    })
  assert.equal((await resend(200, { id: 'receipt' }).send(campaign)).status, 'accepted')
  assert.equal((await resend(422, {}).send(campaign)).status, 'rejected')
  assert.equal((await resend(429, {}).send(campaign)).status, 'unknown')
  assert.equal((await resend(200, {}).send(campaign)).status, 'unknown')
  assert.equal((await resend(200, { id: 'receipt' }).send(envelope)).status, 'rejected')
  assert.equal((await new GmailProvider('fake', true, async () => { throw new Error('timeout') }).send(envelope)).status, 'unknown')
})

test('Resend rejects invalid credential bytes before transport', async () => {
  for (const token of ['', 'with space', 'key\r\ninjected', 'é', 'a'.repeat(8193)]) {
    const provider = new ResendProvider(token, envelope.from, true, async () => { throw new Error('must not send') })
    assert.deepEqual(await provider.send({ ...envelope, bcc: [], kind: 'campaign' }), { status: 'rejected', code: 'credential_invalid' })
  }
})

test('Resend rejects ambiguous recipient shapes without a provider call', async () => {
  let calls = 0
  const provider = new ResendProvider('fake', envelope.from, true, async () => { calls++; return Response.json({ id: 'receipt' }) })
  for (const recipients of [
    { to: ['one@example.com', 'two@example.com'], cc: [], bcc: [] },
    { to: ['one@example.com'], cc: ['copy@example.com'], bcc: [] },
    { to: ['one@example.com'], cc: [], bcc: ['private@example.com'] },
    { to: [], cc: ['copy@example.com'], bcc: [] },
  ]) {
    assert.deepEqual(await provider.send({ ...envelope, ...recipients, kind: 'campaign' }),
      { status: 'rejected', code: 'recipient_shape_unsupported' })
  }
  assert.equal(calls, 0)
})
test('provider response is bounded and malformed UTF8 cannot become acceptance', async () => {
  assert.equal(await providerRequest(async () => new Response('x'.repeat(65537)), 'https://fake.test', {}), null)
  const invalid = new Uint8Array([123,34,105,100,34,58,34,255,34,125])
  assert.equal(await providerRequest(async () => new Response(invalid), 'https://fake.test', {}), null)
})
