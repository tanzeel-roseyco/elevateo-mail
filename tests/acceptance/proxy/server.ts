import { createServer } from 'node:http';
import type { RequestListener, Server } from 'node:http';
import type { Server as SecureServer } from 'node:https';
import { realpathSync } from 'node:fs';
import { routeRequest } from './routing.js';
import { safeError, serveStatic } from './static.js';
import { MAX_BODY_BYTES, proxyApi } from './upstream.js';
import { HTTP_EDGE } from './edge-profile.js';
import type { EdgeProfile } from './edge-profile.js';

// AIDEV-NOTE: Both fixture edges share routing and forwarding; executables fix their identities and API origin.
export function acceptanceHandler(staticRoot: string, upstream: URL, deadlineMs: number,
  edge: EdgeProfile = HTTP_EDGE): RequestListener {
  const root = realpathSync(staticRoot);
  return (input, output) => {
    const deadline = setTimeout(() => { safeError(output, 504); }, deadlineMs);
    output.once('close', () => clearTimeout(deadline));
    const hosts = input.rawHeaders.filter((_value, index) => index % 2 === 0)
      .filter(name => name.toLowerCase() === 'host');
    if (hosts.length !== 1) { safeError(output, 421); return; }
    const route = routeRequest(input.headers.host, input.url ?? '', edge.host);
    if (route.kind === 'reject') { safeError(output, route.status); return; }
    const length = input.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
      safeError(output, 413); return;
    }
    if (route.kind === 'api') {
      void proxyApi(input, output, route.path, upstream, deadlineMs, edge).catch(() => safeError(output, 400));
    } else if (!['GET', 'HEAD'].includes(input.method ?? '') || input.headers['transfer-encoding']
      || (length !== undefined && Number(length) !== 0)) {
      safeError(output, 405);
    } else { void serveStatic(root, route.path, input.method === 'HEAD', output); }
  };
}

export function boundServer(server: Server | SecureServer, deadlineMs: number): void {
  server.maxConnections = 64;
  server.maxRequestsPerSocket = 100;
  server.setTimeout(deadlineMs, socket => socket.destroy());
  server.on('checkContinue', (_input, output) => safeError(output, 417));
  server.on('upgrade', (_input, socket) => socket.destroy());
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
}

export function createAcceptanceServer(staticRoot: string, upstream = new URL('http://api:3000'), deadlineMs = 15000) {
  const server = createServer({ maxHeaderSize: 16384, requestTimeout: deadlineMs,
    headersTimeout: deadlineMs, keepAliveTimeout: 1000 }, acceptanceHandler(staticRoot, upstream, deadlineMs));
  boundServer(server, deadlineMs);
  return server;
}
