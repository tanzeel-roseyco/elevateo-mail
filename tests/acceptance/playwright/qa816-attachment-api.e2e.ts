import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { responseAt, seed, signIn } from './support.js';

const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const uuid = z.uuid();
const sidecarSchema = z.strictObject({ schema_version: z.literal(1), kind: z.literal('qa816_attachment_bytes'),
  mailbox_id: uuid, thread_id: uuid, message_id: uuid, foreign_mailbox_id: uuid,
  clean: z.strictObject({ id: uuid, filename: z.string().regex(/^[A-Za-z0-9._-]{1,120}$/), byte_size: z.number().int().min(1).max(10_485_760),
    sha256: z.string().regex(/^[0-9a-f]{64}$/) }), held_id: uuid, rejected_id: uuid });
const sessionSchema = z.object({ context_id: token, authorization_version: token,
  actor: z.object({ id: uuid }).passthrough() }).passthrough();
const itemSchema = z.strictObject({ id: uuid, filename: z.string(), content_type: z.string(),
  byte_size: z.number().int().min(0), scan_status: z.enum(['pending_scan', 'clean', 'malware', 'scan_failed', 'rejected']) });
const listSchema = z.strictObject({ items: z.array(itemSchema).max(50), next_cursor: z.string().nullable() });
const errorSchema = z.object({ code: z.string().min(1).max(64) }).passthrough();

// AIDEV-NOTE: A missing private receipt is setup failure, not a skipped or fixture-passing API case.
function fixture() {
  const path = process.env.QA816_ATTACHMENT_PATH;
  if (path !== '/acceptance/qa816-attachments.json') throw new Error('QA816 attachment sidecar unavailable');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077) !== 0)
    throw new Error('QA816 attachment sidecar invalid');
  const value = sidecarSchema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  if (value.mailbox_id !== seed.mailboxes.primary || value.thread_id !== seed.data.thread_primary ||
      value.foreign_mailbox_id !== seed.mailboxes.other) throw new Error('QA816 attachment sidecar scope mismatch');
  return value;
}

async function jsonApi(page: Page, path: string, headers: Record<string, string> = {}) {
  return page.evaluate(async ({ path, headers }) => {
    const response = await fetch(path, { credentials: 'same-origin', headers, signal: AbortSignal.timeout(10000) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 65536 || !response.headers.get('content-type')?.includes('application/json'))
      throw new Error('Attachment API JSON boundary invalid');
    return { status: response.status, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  }, { path, headers });
}

async function authorized(page: Page) {
  await signIn(page, 'reader');
  const result = await jsonApi(page, '/v1/session');
  expect(result.status).toBe(200);
  const session = sessionSchema.parse(result.value);
  expect(session.actor.id).toBe(seed.actors.reader.user_id);
  return { 'X-Session-Context': session.context_id,
    'X-Authorization-Version': session.authorization_version };
}

function listPath(value: z.infer<typeof sidecarSchema>) {
  return `/v2/mailboxes/${value.mailbox_id}/threads/${value.thread_id}/messages/${value.message_id}/attachments`;
}

scenario('SCN-QA-827-P', 'clean-private-attachment-bytes-match-disposable-seed', async (page, record) => {
  const value = fixture();
  const headers = await authorized(page);
  const listed = await jsonApi(page, `${listPath(value)}?limit=50`, headers);
  expect(listed.status).toBe(200);
  const list = listSchema.parse(listed.value);
  const clean = list.items.find(item => item.id === value.clean.id);
  expect(clean).toMatchObject({ filename: value.clean.filename, byte_size: value.clean.byte_size,
    scan_status: 'clean' });
  const path = `${listPath(value)}/${value.clean.id}/content`;
  const [download] = await Promise.all([responseAt(page, path), page.evaluate(async ({ path, headers }) => {
    const response = await fetch(path, { credentials: 'same-origin', headers, signal: AbortSignal.timeout(10000) });
    await response.arrayBuffer();
  }, { path, headers })]);
  expect(download.status()).toBe(200);
  expect(download.headers()['content-type']).toBe('application/octet-stream');
  expect(download.headers()['cache-control']).toContain('no-store');
  expect(download.headers()['x-content-type-options']).toBe('nosniff');
  expect(download.headers()['content-disposition']).toContain(value.clean.filename);
  const bytes = await download.body();
  expect(bytes.length).toBe(value.clean.byte_size);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(value.clean.sha256);
  record.assertions.push('Real private V2 list/content 200 returned clean bytes matching disposable fixture SHA-256 and safe response headers');
});

scenario('SCN-QA-827-F1', 'held-and-rejected-attachments-never-yield-bytes', async (page, record) => {
  const value = fixture();
  const headers = await authorized(page);
  const listed = await jsonApi(page, `${listPath(value)}?limit=50`, headers);
  expect(listed.status).toBe(200);
  const list = listSchema.parse(listed.value);
  expect(list.items.find(item => item.id === value.held_id)?.scan_status).toBe('pending_scan');
  expect(list.items.find(item => item.id === value.rejected_id)).toMatchObject({ scan_status: 'rejected', byte_size: 0 });
  const held = await jsonApi(page, `${listPath(value)}/${value.held_id}/content`, headers);
  expect(held.status).toBe(423);
  expect(errorSchema.parse(held.value).code).toBe('attachment_held');
  record.assertions.push('Real held content is 423; rejected metadata has zero bytes and strict page exposes no private key or URL');
});

scenario('SCN-QA-827-F2', 'foreign-mailbox-attachment-bytes-are-unavailable', async (page, record) => {
  const value = fixture();
  const headers = await authorized(page);
  const path = `/v2/mailboxes/${value.foreign_mailbox_id}/threads/${value.thread_id}/messages/${value.message_id}/attachments/${value.clean.id}/content`;
  const denied = await jsonApi(page, path, headers);
  expect(denied.status).toBe(404);
  expect(errorSchema.parse(denied.value).code).toBe('not_available');
  record.assertions.push('Real cross-mailbox content request returns uniform 404 without private bytes');
});
