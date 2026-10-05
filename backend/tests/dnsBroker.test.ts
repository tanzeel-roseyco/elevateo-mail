import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeName, createDnsPlan, recordSchema } from '../dns-broker/plan';
import { readDnsRecord, recheckDnsBaseline } from '../dns-broker/cloudflareRead';
const grant = { owner: 'alice', zoneId: 'a'.repeat(32), zoneName: 'elevateoco.com', subdomain: 'pilot.elevateoco.com', names: ['pilot.elevateoco.com'] };
const record = { id: 'b'.repeat(32), name: 'pilot.elevateoco.com', type: 'MX' as const, content: 'mx.example.com', ttl: 300, priority: 10, proxied: false as const };
const token = 'x'.repeat(40);
const provider = (result: unknown): typeof fetch => async () => Response.json({ success: true, result });
test('exact read-only plan hashes priority and baseline; rejects identity mutation', async () => {
  const a = await createDnsPlan('alice', grant, record, { ...record, priority: 20 }, 1000);
  const b = await createDnsPlan('alice', grant, record, { ...record, priority: 30 }, 1000);
  assert.equal(a.mode, 'read_only'); assert.notEqual(a.hash, b.hash);
  await assert.rejects(createDnsPlan('alice', grant, record, { ...record, id: 'c'.repeat(32) }, 1000));
  assert.equal(recordSchema.safeParse({ ...record, priority: undefined }).success, false);
});
test('owner, exact names, roots and protected existing inbound scope are denied', () => {
  assert.throws(() => authorizeName('bob', grant, record.name));
  for (const name of ['other.pilot.elevateoco.com', 'elevateoco.com', '*.pilot.elevateoco.com']) assert.throws(() => authorizeName('alice', grant, name));
  assert.throws(() => authorizeName('alice', { ...grant, subdomain: 'in.elevateoco.com', names: ['in.elevateoco.com'] }, 'in.elevateoco.com'));
});
test('read is fixed GET and baseline drift is explicit', async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), `https://api.cloudflare.com/client/v4/zones/${grant.zoneId}/dns_records/${record.id}`);
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error');
    return Response.json({ success: true, result: record });
  };
  assert.equal(await recheckDnsBaseline('alice', grant, record, token, fetcher), true);
  assert.equal(await recheckDnsBaseline('alice', grant, record, token, provider({ ...record, priority: 0 })), false);
});
test('wrong identity, malformed and oversized responses fail closed without secrets', async () => {
  for (const fetcher of [provider({ ...record, name: 'elevateoco.com' }), provider(null),
    (async () => new Response('x'.repeat(16_385))) as typeof fetch,
    (async () => { throw new Error(token); }) as typeof fetch]) {
    await assert.rejects(readDnsRecord('alice', grant, record, token, fetcher), { message: 'dns_read_unavailable' });
  }
});
