import { request } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { safeError } from './static.js';

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
  upstream: URL, deadlineMs: number): Promise<void> {
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
  // AIDEV-NOTE: Only this private HTTP edge supplies forwarding identity; browser Origin/Cookie remain unchanged.
  headers.host = 'app.test';
  headers['x-forwarded-host'] = 'app.test';
  headers['x-forwarded-proto'] = 'http';
  headers['x-forwarded-port'] = '80';
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
