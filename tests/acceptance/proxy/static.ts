import { realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ServerResponse } from 'node:http';

const types: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};
export function safeError(response: ServerResponse, status: number): void {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', connection: 'close' });
  response.end(`Acceptance proxy error ${status}\n`);
}
export async function serveStatic(root: string, path: string, head: boolean, response: ServerResponse): Promise<void> {
  const type = types[extname(path)];
  if (!type || (extname(path) === '.html' && path !== '/index.html')) { safeError(response, 404); return; }
  try {
    const file = await realpath(resolve(root, `.${path}`));
    const child = relative(root, file);
    // AIDEV-NOTE: Resolve symlinks before checking containment; image files are immutable at runtime.
    if (!child || isAbsolute(child) || child.split(sep).some(part => part.startsWith('.')))
      return safeError(response, 404);
    const info = await stat(file);
    if (!info.isFile() || info.size > 32 * 1024 * 1024) return safeError(response, 404);
    if (response.destroyed) return;
    response.writeHead(200, { 'content-type': type, 'content-length': info.size,
      'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' });
    if (head) { response.end(); return; }
    const stream = createReadStream(file);
    response.once('close', () => stream.destroy());
    stream.on('error', () => safeError(response, 500));
    stream.pipe(response);
  } catch (error: unknown) {
    const missing = error instanceof Error && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code));
    safeError(response, missing ? 404 : 500);
  }
}
