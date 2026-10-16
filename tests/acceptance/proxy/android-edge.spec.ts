import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { request } from 'node:https';
import { connect, createServer as tcpServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect as tlsConnect } from 'node:tls';
import { test } from 'node:test';
import { createAndroidServer } from './android-tls.js';
import { createAndroidConnect } from './android-connect.js';
import { ANDROID_EDGE } from './edge-profile.js';

// AIDEV-NOTE: Socket tests run in fleet Docker with a read-only disposable QA certificate, never relaxed TLS.
const tlsRoot = process.env.QA_TLS_DIR;
if (!tlsRoot) throw new Error('QA_TLS_DIR required for actual TLS verification');
const ca = readFileSync(join(tlsRoot, 'ca.pem'));
const certificate = readFileSync(join(tlsRoot, 'server.pem'));
const key = readFileSync(join(tlsRoot, 'server.key'));
async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address(); assert(address && typeof address === 'object'); return address.port;
}
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
// AIDEV-NOTE: A silent or prematurely closed tunnel must fail the gate instead of hanging its runner.
function readUntil(socket: Socket, initial: string, complete: (data: string) => boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = initial;
    const finish = (error?: Error) => {
      clearTimeout(timer); socket.off('data', read); socket.off('error', fail);
      socket.off('end', ended); socket.off('close', ended);
      if (error) { socket.destroy(); reject(error); } else resolve(data);
    };
    const fail = (error: Error) => finish(error);
    const ended = () => finish(new Error('Tunnel closed before expected bytes'));
    const read = (chunk: Buffer) => {
      data += chunk.toString();
      if (data.length > 65536) finish(new Error('Oversize tunnel response'));
      else if (complete(data)) finish();
    };
    const timer = setTimeout(() => fail(new Error('Tunnel read timeout')), 3000);
    socket.on('data', read); socket.once('error', fail); socket.once('end', ended); socket.once('close', ended);
    if (complete(data)) finish();
  });
}
function get(port: number, headers: Record<string, string> = {}, servername = ANDROID_EDGE.host as string) {
  return new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const outgoing = request({ hostname: '127.0.0.1', port, servername, ca, path: '/v1/session', agent: false,
      headers: { host: ANDROID_EDGE.host, ...headers } }, incoming => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk)); incoming.on('error', reject);
      incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers,
        body: Buffer.concat(chunks).toString() }));
    });
    outgoing.setTimeout(3000, () => outgoing.destroy(new Error('Test timeout')));
    outgoing.on('error', reject); outgoing.end();
  });
}
function tunnel(port: number | string, target = `${ANDROID_EDGE.host}:443`, extra = '', payload = '') {
  return new Promise<{ socket: Socket; head: string; tail: string }>((resolve, reject) => {
    const socket = typeof port === 'string' ? connect(port) : connect(port, '127.0.0.1'); let data = '';
    const fail = (error: Error) => { socket.destroy(); reject(error); };
    socket.setTimeout(3000, () => fail(new Error('CONNECT test timeout')));
    socket.once('error', fail);
    socket.on('data', function read(chunk: Buffer) {
      data += chunk.toString(); if (data.length > 65536) { fail(new Error('Oversize response')); return; }
      const end = data.indexOf('\r\n\r\n');
      if (end < 0) return;
      socket.removeListener('data', read); socket.removeListener('error', fail); socket.setTimeout(0);
      resolve({ socket, head: data.slice(0, end), tail: data.slice(end + 4) });
    });
    socket.once('connect', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${extra}\r\n${payload}`));
  });
}
test('HTTPS preserves Origin, secure cookies and fixed forwarding, rejects host/SNI confusion', async t => {
  const root = await mkdtemp(join(tmpdir(), 'android-edge-')); t.after(() => rm(root, { recursive: true }));
  await writeFile(join(root, 'index.html'), '<html>production</html>'); let calls = 0;
  const api = httpServer((input, output) => {
    calls++;
    assert.equal(input.headers.host, ANDROID_EDGE.host);
    assert.equal(input.headers.origin, 'https://wrong-origin.invalid');
    assert.equal(input.headers.cookie, 'synthetic=session');
    assert.equal(input.headers['x-forwarded-host'], ANDROID_EDGE.host);
    assert.equal(input.headers['x-forwarded-proto'], 'https');
    assert.equal(input.headers['x-forwarded-port'], '443');
    assert.equal(input.headers['x-forwarded-for'], '127.0.0.1');
    assert.equal(input.headers['x-real-ip'], undefined); assert.equal(input.headers.forwarded, undefined);
    assert.equal(input.headers['x-forwarded-surprise'], undefined); assert.equal(input.headers.via, undefined);
    output.writeHead(403, { 'set-cookie': ['a=1; Secure; HttpOnly; SameSite=Strict', 'b=2; Secure; HttpOnly'],
      'content-type': 'application/json' }); output.end('{"error":"denied"}');
  });
  const apiPort = await listen(api); t.after(() => close(api));
  const server = createAndroidServer(root, certificate, key, new URL(`http://127.0.0.1:${apiPort}`));
  const port = await listen(server); t.after(() => { server.closeAllConnections(); return close(server); });
  const result = await get(port, { origin: 'https://wrong-origin.invalid', cookie: 'synthetic=session',
    'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'http', 'x-forwarded-for': '8.8.8.8',
    'x-real-ip': '8.8.4.4', forwarded: 'host=attacker.invalid', 'x-forwarded-surprise': 'forged', via: 'forged' });
  assert.equal(result.status, 403);
  assert.deepEqual(result.headers['set-cookie'], ['a=1; Secure; HttpOnly; SameSite=Strict', 'b=2; Secure; HttpOnly']);
  assert.equal(result.body, '{"error":"denied"}');
  for (const host of ['app.test', `${ANDROID_EDGE.host}:443`, 'attacker.invalid'])
    assert.equal((await get(port, { host })).status, 421);
  await assert.rejects(get(port, {}, 'attacker.invalid'));
  assert.equal(calls, 1);
  const duplicate = await new Promise<string>((resolve, reject) => {
    const socket = tlsConnect({ host: '127.0.0.1', port, servername: ANDROID_EDGE.host, ca }); let data = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('TLS test timeout')));
    socket.on('error', reject); socket.on('data', chunk => { data += String(chunk); });
    socket.once('end', () => resolve(data)); socket.once('secureConnect', () => socket.write(
      `GET /v1/session HTTP/1.1\r\nHost: ${ANDROID_EDGE.host}\r\nHost: attacker.invalid\r\nConnection: close\r\n\r\n`));
  });
  assert.match(duplicate, /^HTTP\/1\.1 (400|421) /); assert.equal(calls, 1);
});
test('CONNECT targets one service and rejects foreign authority, duplicate host and framed bodies', async t => {
  let calls = 0; const clients = new Set<Socket>();
  const remote = tcpServer(socket => {
    calls++; clients.add(socket); socket.once('close', () => clients.delete(socket)); socket.pipe(socket);
  });
  const remotePort = await listen(remote);
  t.after(() => { for (const client of clients) client.destroy(); return close(remote); });
  const proxy = createAndroidConnect('127.0.0.1', remotePort); const port = await listen(proxy.server);
  t.after(() => proxy.close());
  for (const [target, extra] of [['attacker.invalid:443', ''], [`${ANDROID_EDGE.host}:80`, ''],
    [`${ANDROID_EDGE.host}:443`, 'Host: attacker.invalid\r\n'],
    [`${ANDROID_EDGE.host}:443`, 'Content-Length: 0\r\n'],
    [`${ANDROID_EDGE.host}:443`, 'Transfer-Encoding: chunked\r\n']]) {
    const result = await tunnel(port, target, extra); assert.match(result.head, /^HTTP\/1\.1 (400|403) /);
    result.socket.destroy();
  }
  assert.equal(calls, 0);
  const result = await tunnel(port, undefined, '', 'initial'); assert.match(result.head, /^HTTP\/1\.1 200 /);
  try {
    assert.equal(await readUntil(result.socket, result.tail, data => data.length >= 7), 'initial');
    assert.equal(calls, 1);
  } finally { result.socket.destroy(); }
});
test('CONNECT lifetime closes both idle tunnel ends', async t => {
  const clients = new Set<Socket>();
  const remote = tcpServer(socket => { clients.add(socket); socket.once('close', () => clients.delete(socket)); });
  const remotePort = await listen(remote);
  t.after(() => { for (const client of clients) client.destroy(); return close(remote); });
  const proxy = createAndroidConnect('127.0.0.1', remotePort, 100); const port = await listen(proxy.server);
  t.after(() => proxy.close()); const result = await tunnel(port); const started = Date.now();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tunnel outlived limit')), 2000);
    result.socket.once('close', () => { clearTimeout(timeout); resolve(); }); result.socket.resume();
  });
  assert(Date.now() - started < 1500);
});

test('TLS through the allowlisted CONNECT tunnel verifies the CA and serves the production page', async t => {
  const root = await mkdtemp(join(tmpdir(), 'android-connect-tls-')); t.after(() => rm(root, { recursive: true }));
  await writeFile(join(root, 'index.html'), '<html>fixture-production</html>');
  const server = createAndroidServer(root, certificate, key); const tlsPort = await listen(server);
  t.after(() => { server.closeAllConnections(); return close(server); });
  const proxy = createAndroidConnect('127.0.0.1', tlsPort); const socketPath = join(root, 'edge.sock');
  // AIDEV-NOTE: Exercise the actual UNIX transport used across container mount boundaries.
  await new Promise<void>((resolve, reject) => {
    proxy.server.once('error', reject); proxy.server.listen(socketPath, resolve);
  });
  t.after(() => proxy.close());
  const collision = tcpServer();
  await assert.rejects(new Promise<void>((resolve, reject) => {
    collision.once('error', reject); collision.listen(socketPath, resolve);
  }), { code: 'EADDRINUSE' });
  const result = await tunnel(socketPath); assert.equal(result.tail, '');
  const socket = tlsConnect({ socket: result.socket, servername: ANDROID_EDGE.host, ca });
  t.after(() => socket.destroy());
  const response = readUntil(socket, '', data => data.includes('<html>fixture-production</html>'));
  socket.once('secureConnect', () => {
    assert.equal(socket.authorized, true);
    socket.write(`GET / HTTP/1.1\r\nHost: ${ANDROID_EDGE.host}\r\nConnection: close\r\n\r\n`);
  });
  assert.match(await response, /^HTTP\/1\.1 200 /);
});
