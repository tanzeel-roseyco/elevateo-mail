import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verifySvix } from '../providers/svix'

// AIDEV-NOTE: Independent published vector: https://docs.svix.com/receiving/verifying-payloads/how-manual
const secret = 'whsec_plJ3nmyCDGBKInavdOK15jsl'
const raw = new TextEncoder().encode('{"event_type":"ping","data":{"success":true}}')
const headers = { id: 'msg_loFOjxBNrRLzqYUf', timestamp: '1731705121',
  signature: 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=' }
const now = 1731705121000

test('Svix published vector verifies at both inclusive freshness boundaries', async () => {
  for (const at of [now, now - 300_000, now + 300_000]) assert.equal(await verifySvix(raw, headers, secret, at), true)
})

test('Svix authenticates body, message ID, timestamp and key', async () => {
  assert.equal(await verifySvix(new TextEncoder().encode('tampered'), headers, secret, now), false)
  assert.equal(await verifySvix(raw, { ...headers, id: 'msg_other' }, secret, now), false)
  assert.equal(await verifySvix(raw, { ...headers, timestamp: '1731705122' }, secret, now), false)
  assert.equal(await verifySvix(raw, headers, 'whsec_YWFhYWFhYWFhYWFhYWFhYQ==', now), false)
  for (const at of [now - 300_001, now + 300_001, NaN, Infinity, -1]) {
    assert.equal(await verifySvix(raw, headers, secret, at), false)
  }
})

test('Svix accepts rotated signatures and ignores unsupported versions', async () => {
  const invalid = `v1,${'A'.repeat(43)}=`
  assert.equal(await verifySvix(raw, { ...headers, signature: `${invalid} v2,YQ== ${headers.signature}` }, secret, now), true)
  assert.equal(await verifySvix(raw, { ...headers, signature: headers.signature.replace('v1,', 'v2,') }, secret, now), false)
})

test('Svix rejects malformed inputs and bounded header or key violations', async () => {
  for (const bad of [null, {}, { ...headers, id: 'x'.repeat(257) }, { ...headers, timestamp: `${now}` },
    { ...headers, signature: Array(9).fill(headers.signature).join(' ') }, { ...headers, signature: 'x'.repeat(4097) },
    { ...headers, signature: 'v1,!!!!' }, { ...headers, signature: 'v1,A' }, { ...headers, signature: '' }]) {
    assert.equal(await verifySvix(raw, bad, secret, now), false)
  }
  for (const bad of [null, '', 'whsec_YQ==', 'whsec_!!!!', `whsec_${'A'.repeat(508)}`]) {
    assert.equal(await verifySvix(raw, headers, bad, now), false)
  }
})

test('Svix byte limit includes multibyte text and verifies independently signed maximum payload', async () => {
  const maximum = new TextEncoder().encode('é'.repeat(32768))
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`${headers.id}.${headers.timestamp}.`).update(maximum).digest('base64')
  assert.equal(await verifySvix(maximum, { ...headers, signature: `v1,${signature}` }, secret, now), true)
  assert.equal(await verifySvix(new Uint8Array(65537), headers, secret, now), false)
})

test('Svix captures immutable signed bytes before asynchronous verification', async () => {
  const input = raw.slice()
  const verification = verifySvix(input, headers, secret, now)
  input.fill(0)
  assert.equal(await verification, true)
})
