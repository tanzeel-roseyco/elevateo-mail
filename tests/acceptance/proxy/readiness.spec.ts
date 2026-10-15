import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { checkReadiness, ReadinessError } from './readiness.js';

const session = { code: 'unauthenticated', message: 'Authentication required', request_id: 'test-request' };
type Reply = (request: IncomingMessage, response: ServerResponse) => void;

// AIDEV-NOTE: These are actual HTTP sockets inside fleet Docker, with no Playwright response interception.
async function endpoint(t: TestContext, reply: Reply): Promise<URL> {
  const server = createServer(reply);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  return new URL(`http://127.0.0.1:${address.port}`);
}

function app(reply: Reply): Reply {
  return (request, response) => {
    if (request.url === '/v1/session') { reply(request, response); return; }
    response.writeHead(['/', '/auth/complete'].includes(request.url ?? '') ? 200 : 404,
      { 'content-type': 'text/html; charset=utf-8' });
    response.end('<html>application</html>');
  };
}

function json(response: ServerResponse, body: unknown, status = 401): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function failure(target: string, reason: string, retryable = false): (error: unknown) => boolean {
  return error => {
    assert(error instanceof ReadinessError);
    assert.equal(error.message, `READINESS:${target}:${reason}`);
    assert.equal(error.retryable, retryable);
    return true;
  };
}

test('readiness verifies document, callback, unauthenticated JSON and source isolation', async t => {
  const seen: string[] = [];
  const handler = app((_request, response) => json(response, session));
  const origin = await endpoint(t, (request, response) => {
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.authorization, undefined);
    seen.push(request.url ?? '');
    handler(request, response);
  });
  await checkReadiness(origin);
  assert.deepEqual(seen, ['/', '/auth/complete', '/v1/session', '/dev-fixtures.html', '/src/main.tsx']);
});

test('SPA fallback is a content-type failure even when its status mimics the API', async t => {
  for (const status of [200, 401]) await t.test(String(status), async child => {
    const origin = await endpoint(child, app((_request, response) => {
      response.writeHead(status, { 'content-type': 'text/html' });
      response.end('<html>private marker never logged</html>');
    }));
    await assert.rejects(checkReadiness(origin), failure('session', 'content_type'));
  });
});

test('status alone cannot admit malformed or mismatched API error envelopes', async t => {
  for (const body of [null, [], {}, { ...session, code: 'forbidden' }, { ...session, request_id: '' },
    { ...session, request_id: 'a'.repeat(129) }, { ...session, extra: 'private' }]) {
    await t.test(JSON.stringify(body), async child => {
      const origin = await endpoint(child, app((_request, response) => json(response, body)));
      await assert.rejects(checkReadiness(origin), failure('session', 'schema'));
    });
  }
  const origin = await endpoint(t, app((_request, response) => {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end('{private malformed data');
  }));
  await assert.rejects(checkReadiness(origin), failure('session', 'schema'));
});

test('API response byte limit, wrong status and transient upstream failures remain distinct', async t => {
  for (const [status, body, reason, retryable] of [
    [401, { ...session, request_id: 'x'.repeat(4096) }, 'body_limit', false],
    [200, session, 'status', false], [503, {}, 'status', true],
  ] as const) await t.test(reason + status, async child => {
    const origin = await endpoint(child, app((_request, response) => json(response, body, status)));
    await assert.rejects(checkReadiness(origin), failure('session', reason, retryable));
  });
});

test('redirects are not followed and document media is enforced', async t => {
  const seen: string[] = [];
  const redirect = await endpoint(t, (request, response) => {
    seen.push(request.url ?? '');
    response.writeHead(302, { 'content-type': 'text/html', location: '/private' });
    response.end();
  });
  await assert.rejects(checkReadiness(redirect), failure('document', 'status'));
  assert.deepEqual(seen, ['/']);
  const text = await endpoint(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' }); response.end('wrong document');
  });
  await assert.rejects(checkReadiness(text), failure('document', 'content_type'));
});

test('a stalled stream is bounded and classified as retryable transport failure', async t => {
  let markClosed: () => void = () => {};
  const closed = new Promise<void>(resolve => { markClosed = resolve; });
  const origin = await endpoint(t, app((_request, response) => {
    response.once('close', markClosed);
    response.writeHead(401, { 'content-type': 'application/json' }); response.write('{');
  }));
  await assert.rejects(checkReadiness(origin, false, 500), failure('session', 'network', true));
  // AIDEV-NOTE: Observe socket closure rather than assume the server received an abort within a fixed sleep.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('aborted socket remained open')), 2000);
    void closed.then(() => { clearTimeout(timer); resolve(); });
  });
});

test('invalid CLI arguments fail without contacting application or echoing input', async () => {
  await assert.rejects(promisify(execFile)(process.execPath, [
    fileURLToPath(new URL('./readiness-cli.js', import.meta.url)), 'private-invalid-value',
  ]), error => {
    assert(error instanceof Error && 'code' in error && 'stderr' in error && 'stdout' in error);
    assert.equal(error.code, 2);
    assert.equal(error.stderr, 'READINESS:configuration:invalid\n');
    assert.equal(error.stdout, '');
    return true;
  });
});

test('Grid readiness requires boolean readiness with its larger bounded status envelope', async t => {
  for (const ready of [false, null, 'true', true]) await t.test(String(ready), async child => {
    const origin = await endpoint(child, (_request, response) =>
      json(response, { value: { ready, nodes: 'x'.repeat(8192) } }, 200));
    if (ready === true) await checkReadiness(origin, true);
    else await assert.rejects(checkReadiness(origin, true),
      failure('grid', ready === false ? 'grid_not_ready' : 'schema', ready === false));
  });
});
