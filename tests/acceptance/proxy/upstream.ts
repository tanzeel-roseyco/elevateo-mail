import { request } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { safeError } from './static.js';
import { HTTP_EDGE } from './edge-profile.js';
import type { EdgeProfile } from './edge-profile.js';

export const MAX_BODY_BYTES = 1024 * 1024;
function endToEnd(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const removed = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', 'forwarded', 'via',
    ...(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !removed.has(key)
    && !key.startsWith('x-forwarded-') && key !== 'x-real-ip'));
}
// AIDEV-NOTE: Buffer only a bounded body so oversized writes never partially reach the real API.
export async function proxyApi(input: IncomingMessage, output: ServerResponse, target: string,
  upstream: URL, deadlineMs: number, edge: EdgeProfile = HTTP_EDGE): Promise<void> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) { safeError(output, 413); return; }
    chunks.push(buffer);
  }
  if (output.destroyed) return;
  const headers = endToEnd(input.headers);
  // AIDEV-NOTE: Edge identity is fixed; preserve browser Origin/Cookie and collapse fixture clients to one IP.
  headers.host = edge.host;
  headers['x-forwarded-host'] = edge.host;
  headers['x-forwarded-proto'] = edge.scheme;
  headers['x-forwarded-port'] = edge.port;
  headers['x-forwarded-for'] = '127.0.0.1';
  headers['content-length'] = String(bytes);
  const outgoing = request({ hostname: upstream.hostname, port: upstream.port, path: target,
    method: input.method, headers, agent: false }, incoming => {
    output.writeHead(incoming.statusCode ?? 502, endToEnd(incoming.headers));
    incoming.on('error', () => safeError(output, 502));
    incoming.pipe(output);
  });
  const timer = setTimeout(() => { safeError(output, 504); outgoing.destroy(); }, deadlineMs);
  output.once('close', () => { clearTimeout(timer); outgoing.destroy(); });
  outgoing.on('error', () => safeError(output, 502));
  outgoing.end(Buffer.concat(chunks, bytes));
}
