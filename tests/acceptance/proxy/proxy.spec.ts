import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { routeRequest } from './routing.js';
import { createAcceptanceServer } from './server.js';
import { MAX_BODY_BYTES } from './upstream.js';

// AIDEV-NOTE: Loopback sockets here run only inside root's Docker test container, never on the host.
async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  return address.port;
}
async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
function get(port: number, path: string, headers: IncomingHttpHeaders = {}, method = 'GET', body = '') {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const outgoing = request({ hostname: '127.0.0.1', port, path, method,
      headers: { host: 'app.test', ...headers }, agent: false }, incoming => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('error', reject);
      incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0,
        headers: incoming.headers, body: Buffer.concat(chunks).toString() }));
    });
    outgoing.setTimeout(3000, () => outgoing.destroy(new Error('Test request timed out')));
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}
test('raw routing rejects unsafe targets and preserves the API target', () => {
  for (const path of ['/../secret', '/%2e%2e/secret', '/assets/%252e%252e/secret', '/.env',
    '/assets/../index.html', '/assets/%5csecret', '//evil.test/x', 'http://evil.test/', '/bad%zz', '/x#y'])
    assert.equal(routeRequest('app.test', path).kind, 'reject', path);
  for (const host of [undefined, 'evil.test', 'app.test:8080', 'app.test:80', 'APP.TEST'])
    assert.deepEqual(routeRequest(host, '/'), { kind: 'reject', status: 421 });
  assert.deepEqual(routeRequest('app.test', '/v1/session?x=1'), { kind: 'api', path: '/v1/session?x=1' });
  assert.deepEqual(routeRequest('app.test', '/v2/campaigns?cursor=a%2Fb'),
    { kind: 'api', path: '/v2/campaigns?cursor=a%2Fb' });
  for (const path of ['/v1', '/v2']) assert.deepEqual(routeRequest('app.test', path), { kind: 'reject', status: 404 });
  assert.equal(routeRequest('app.test', '/v20/campaigns').kind, 'static');
  assert.equal(routeRequest('app.test', '/auth/accept').kind, 'api');
  assert.equal(routeRequest('app.test', `/${'x'.repeat(8192)}`).kind, 'reject');
});
test('production documents, assets, containment and methods', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'acceptance-proxy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'web');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<html>production</html>');
  await writeFile(join(root, 'assets', 'app.js'), 'export {};');
  await writeFile(join(directory, 'private.js'), 'private');
  await symlink(join(directory, 'private.js'), join(root, 'assets', 'escape.js'));
  const server = createAcceptanceServer(root);
  const port = await listen(server);
  t.after(() => close(server));
  for (const path of ['/', '/auth/complete', '/auth/complete/']) {
    const result = await get(port, path);
    assert.equal(result.status, 200);
    assert.match(result.headers['content-type'] ?? '', /^text\/html/);
    assert.equal(result.body, '<html>production</html>');
  }
  assert.equal((await get(port, '/assets/app.js')).body, 'export {};');
  assert.equal((await get(port, '/', {}, 'HEAD')).body, '');
  for (const path of ['/dev-fixtures.html', '/src/main.tsx', '/assets/missing.js', '/assets/escape.js', '/missing']) {
    const result = await get(port, path);
    assert.equal(result.status, 404, path);
    assert.doesNotMatch(result.headers['content-type'] ?? '', /html/);
  }
  assert.equal((await get(port, '/%2e%2e/private.js')).status, 400);
  assert.equal((await get(port, '/', {}, 'POST')).status, 405);
  assert.equal((await get(port, '/', { host: 'other.test' })).status, 421);
});
test('API preserves status, cookies, origin and trusted forwarding; limits writes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'acceptance-proxy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let calls = 0;
  const api = createServer((input, output) => {
    calls++;
    assert.equal(input.headers.origin, 'http://app.test');
    assert.equal(input.headers.cookie, 'synthetic=session');
    assert.equal(input.headers.host, 'app.test');
    assert.equal(input.headers['x-forwarded-host'], 'app.test');
    assert.equal(input.headers['x-forwarded-proto'], 'http');
    assert.equal(input.headers.forwarded, undefined);
    assert.equal(input.url, '/auth/accept');
    const chunks: Buffer[] = [];
    input.on('data', (chunk: Buffer) => chunks.push(chunk));
    input.on('end', () => {
      assert.equal(Buffer.concat(chunks).toString(), 'synthetic');
      output.writeHead(409, { 'content-type': 'application/json', 'set-cookie': ['a=1; HttpOnly', 'b=2; HttpOnly'] });
      output.end('{"error":"conflict"}');
    });
  });
  const apiPort = await listen(api);
  t.after(() => close(api));
  const server = createAcceptanceServer(root, new URL(`http://127.0.0.1:${apiPort}`));
  const port = await listen(server);
  t.after(() => close(server));
  const result = await get(port, '/auth/accept', { origin: 'http://app.test', cookie: 'synthetic=session',
    'x-forwarded-host': 'evil.test', 'x-forwarded-proto': 'https', forwarded: 'host=evil.test' }, 'POST', 'synthetic');
  assert.equal(result.status, 409);
  assert.equal(result.body, '{"error":"conflict"}');
  assert.equal(result.headers['set-cookie']?.length, 2);
  assert.equal((await get(port, '/v1/drafts', { 'content-length': String(MAX_BODY_BYTES + 1) }, 'POST')).status, 413);
  assert.equal(calls, 1);
});
test('failed and stalled upstream never return an SPA document', async t => {
  const root = await mkdtemp(join(tmpdir(), 'acceptance-proxy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), '<html>must not leak</html>');
  const api = createServer((input, output) => {
    if (input.url === '/v1/fail' || input.url === '/v2/fail') output.destroy();
    // The other path deliberately stays open until the proxy deadline aborts it.
  });
  const apiPort = await listen(api);
  t.after(() => close(api));
  const server = createAcceptanceServer(root, new URL(`http://127.0.0.1:${apiPort}`), 200);
  const port = await listen(server);
  t.after(() => close(server));
  for (const version of ['v1', 'v2']) {
    const failed = await get(port, `/${version}/fail`);
    assert.equal(failed.status, 502);
    assert.doesNotMatch(failed.body, /html/);
    const stalled = await get(port, `/${version}/stalled`);
    assert.equal(stalled.status, 504);
    assert.doesNotMatch(stalled.body, /html/);
  }
});
test('V2 responses retain API semantics and reject oversized writes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'acceptance-proxy-v2-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), '<html>must not leak</html>');
  const requests: { method: string | undefined; path: string | undefined; body: string }[] = [];
  const api = createServer((input, output) => {
    assert.equal(input.headers.cookie, 'synthetic=session');
    assert.equal(input.headers.origin, 'http://app.test');
    assert.equal(input.headers['x-forwarded-host'], 'app.test');
    const chunks: Buffer[] = [];
    input.on('data', (chunk: Buffer) => chunks.push(chunk));
    input.on('end', () => {
      requests.push({ method: input.method, path: input.url, body: Buffer.concat(chunks).toString() });
      const missing = input.method === 'GET';
      output.writeHead(missing ? 404 : 200, { 'content-type': 'application/json', 'x-request-id': 'synthetic-v2' });
      output.end(missing ? '{"error":"not_available"}' : '{"version":2}');
    });
  });
  const apiPort = await listen(api);
  t.after(() => close(api));
  const server = createAcceptanceServer(root, new URL(`http://127.0.0.1:${apiPort}`));
  const port = await listen(server);
  t.after(() => close(server));
  const headers = { cookie: 'synthetic=session', origin: 'http://app.test', 'content-type': 'application/json' };
  const missing = await get(port, '/v2/threads/missing/messages/missing?cursor=a%2Fb', headers);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers['content-type'], 'application/json');
  assert.equal(missing.body, '{"error":"not_available"}');
  const saved = await get(port, '/v2/campaigns/candidate?version=1', headers, 'PUT', '{"name":"Synthetic"}');
  assert.equal(saved.status, 200);
  assert.equal(saved.body, '{"version":2}');
  assert.equal(saved.headers['x-request-id'], 'synthetic-v2');
  assert.equal((await get(port, '/v2/campaigns', { 'content-length': String(MAX_BODY_BYTES + 1) }, 'POST')).status, 413);
  assert.equal((await get(port, '/v2/campaigns', { host: 'evil.test' })).status, 421);
  assert.equal((await get(port, '/v2/%2e%2e/secret')).status, 400);
  assert.deepEqual(requests, [
    { method: 'GET', path: '/v2/threads/missing/messages/missing?cursor=a%2Fb', body: '' },
    { method: 'PUT', path: '/v2/campaigns/candidate?version=1', body: '{"name":"Synthetic"}' },
  ]);
});
