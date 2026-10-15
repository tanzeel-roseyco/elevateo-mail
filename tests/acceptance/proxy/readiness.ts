import { setTimeout as delay } from 'node:timers/promises';

type Target = 'document' | 'callback' | 'session' | 'fixture' | 'source' | 'grid';
type Reason = 'network' | 'status' | 'content_type' | 'body_limit' | 'schema' | 'grid_not_ready';
type Check = { target: Target; path: string; status: number; media?: string };
const APP_CHECKS: readonly Check[] = [
  { target: 'document', path: '/', status: 200, media: 'text/html' },
  { target: 'callback', path: '/auth/complete', status: 200, media: 'text/html' },
  { target: 'session', path: '/v1/session', status: 401, media: 'application/json' },
  { target: 'fixture', path: '/dev-fixtures.html', status: 404 },
  { target: 'source', path: '/src/main.tsx', status: 404 },
];
const GRID_CHECKS: readonly Check[] = [{ target: 'grid', path: '/status', status: 200, media: 'application/json' }];

// AIDEV-NOTE: Diagnostics contain fixed codes only; response bodies, headers and credentials must never enter logs.
export class ReadinessError extends Error {
  constructor(readonly target: Target, readonly reason: Reason, readonly retryable = false) {
    super(`READINESS:${target}:${reason}`);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function jsonBody(response: Response, target: Target): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ReadinessError(target, 'schema');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > (target === 'grid' ? 65536 : 4096)) throw new ReadinessError(target, 'body_limit');
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { throw new ReadinessError(target, 'schema'); }
  } finally {
    reader.releaseLock();
  }
}

async function check(origin: URL, spec: Check, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(spec.path, origin), {
      signal: controller.signal, redirect: 'manual',
    });
    // AIDEV-NOTE: Inspect media before status so an API routed to the SPA has a specific, non-timeout failure.
    const media = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (spec.media && media !== spec.media && response.status < 500)
      throw new ReadinessError(spec.target, 'content_type');
    if (response.status !== spec.status)
      throw new ReadinessError(spec.target, 'status', response.status >= 500);
    if (spec.target === 'session') {
      const body = await jsonBody(response, spec.target);
      if (!record(body) || Object.keys(body).sort().join(',') !== 'code,message,request_id'
        || body.code !== 'unauthenticated' || body.message !== 'Authentication required'
        || typeof body.request_id !== 'string' || body.request_id.length < 1 || body.request_id.length > 128)
        throw new ReadinessError(spec.target, 'schema');
    } else if (spec.target === 'grid') {
      const body = await jsonBody(response, spec.target);
      if (!record(body) || !record(body.value) || typeof body.value.ready !== 'boolean')
        throw new ReadinessError(spec.target, 'schema');
      if (!body.value.ready) throw new ReadinessError(spec.target, 'grid_not_ready', true);
    }
  } catch (error) {
    if (error instanceof ReadinessError) throw error;
    throw new ReadinessError(spec.target, 'network', true);
  } finally {
    // AIDEV-NOTE: Abort even unread/oversized streams; cleanup must not mask the fixed diagnostic reason.
    clearTimeout(deadline);
    controller.abort();
  }
}

// AIDEV-NOTE: Origins are fixed by the CLI; socket tests inject only disposable container-loopback servers.
export async function checkReadiness(origin: URL, grid = false, timeoutMs = 2000): Promise<void> {
  for (const spec of grid ? GRID_CHECKS : APP_CHECKS) await check(origin, spec, timeoutMs);
}

export async function waitForReadiness(grid: boolean): Promise<void> {
  const end = performance.now() + 60000;
  const origin = new URL(grid ? 'http://selenium:4444' : 'http://app.test');
  for (;;) {
    try { await checkReadiness(origin, grid); return; }
    catch (error) {
      if (!(error instanceof ReadinessError) || !error.retryable || performance.now() >= end) throw error;
      await delay(500);
    }
  }
}
