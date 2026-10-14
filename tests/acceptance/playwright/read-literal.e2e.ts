import { expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { responseAt, seed, signIn } from './support.js';
import { loadAcceptanceConfig } from '../shared/config.js';

const caseId = 'SCN-READ-002-F2';
// AIDEV-NOTE: Exact synthetic text matches Variants::LITERAL; never fetch its reserved .invalid origin.
const literal = '<script>globalThis.ACCEPTANCE_LITERAL_EXECUTED=true</script><img src="https://literal.invalid/pixel"><a href="https://literal.invalid/">synthetic link</a>';
const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const detail = z.strictObject({ context_id: token, authorization_version: token, next_cursor: z.null(),
  thread: z.strictObject({ id: z.uuid(), mailbox_id: z.uuid(), subject: z.string().max(998).nullable(),
    subject_truncated: z.literal(false), unread: z.boolean(), message_count: z.literal(1) }),
  messages: z.array(z.strictObject({ id: z.uuid(), sender: z.null(), to: z.array(z.never()).length(0),
    sent_at: z.iso.datetime().nullable(), body_text: z.string().max(16384), body_truncated: z.literal(false),
    attachment_count: z.literal(0) })).length(1) });

async function read(response: Response, threadId: string, empty: boolean, unread: boolean): Promise<void> {
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']?.includes('application/json')).toBe(true);
  const bytes = await response.body();
  expect(bytes.length).toBeLessThanOrEqual(2097152);
  const parsed = detail.safeParse(JSON.parse(bytes.toString('utf8')) as unknown);
  if (!parsed.success) throw new Error('Literal fixture response rejected');
  expect(parsed.data.thread).toMatchObject({ id: threadId, mailbox_id: seed.mailboxes.primary,
    subject: empty ? null : '', unread });
  expect(parsed.data.messages[0]?.body_text).toBe(empty ? '' : literal);
  if (empty) expect(parsed.data.messages[0]?.sent_at).toBeNull();
  else expect(Date.parse(parsed.data.messages[0]?.sent_at ?? '')).toBe(Date.parse(seed.data.ordered_at));
}

async function rendered(page: Page, empty: boolean, unread: boolean): Promise<void> {
  const article = page.getByRole('article', { name: 'Conversation', exact: true });
  await expect(article).toBeVisible();
  const heading = article.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText(empty ? '(no subject)' : '');
  await expect(article.getByText('Unknown sender', { exact: true })).toBeVisible();
  if (empty) await expect(article.getByText('No date recorded', { exact: true })).toBeVisible();
  const pre = article.locator('pre');
  await expect(pre).toHaveCount(1);
  if (!empty) await expect(pre).toBeVisible();
  expect(await pre.textContent()).toBe(empty ? '' : literal);
  await expect(pre.locator('*')).toHaveCount(0);
  await expect(article.locator('script, img, iframe, object, embed, a[href^="javascript:"], a[href*="literal.invalid"]')).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & {
    ACCEPTANCE_LITERAL_EXECUTED?: unknown }).ACCEPTANCE_LITERAL_EXECUTED === undefined)).toBe(true);
  await expect(article.getByRole('button', { name: unread ? 'Mark as read' : 'Mark as unread', exact: true })).toBeVisible();
}

// AIDEV-NOTE: Dedicated fresh seed only; GET/UI observations cannot prove physical read-state row immutability.
scenario(caseId, 'dedicated-hostile-null-empty-real-read', async (page, record) => {
  const config = loadAcceptanceConfig();
  expect(seed.fixture_variant).toBe('literal_read');
  expect(seed.fixture_identity).toMatchObject({ run_id: config.runId, dispatch_id: config.dispatchId,
    case_id: caseId, engine: 'chromium', attempt: 0 });
  expect(process.env.ACCEPTANCE_BROWSER).toBe('chromium');
  const emptyId = seed.literal_threads.read_empty;
  const literalId = seed.literal_threads.read_literal;
  if (!emptyId || !literalId) throw new Error('Dedicated literal fixture missing');
  const browser = page.context().browser();
  if (!browser) throw new Error('Real browser missing');
  let external = 0;
  let readWrites = 0;
  // Fresh contexts prevent actor/session/cache crossover; routing forwards real same-origin responses unchanged.
  for (const actor of ['reader', 'manager_backup'] as const) {
    const context = await browser.newContext({ baseURL: 'http://app.test', serviceWorkers: 'block' });
    try {
      await context.route('**/*', async route => {
        if (new URL(route.request().url()).origin !== 'http://app.test') {
          external += 1;
          await route.abort('blockedbyclient');
        } else await route.continue();
      });
      context.on('request', request => {
        if (/\/v1\/threads\/[^/]+\/read-state$/.test(new URL(request.url()).pathname)
          && request.method() !== 'GET') readWrites += 1;
      });
      const reader = await context.newPage();
      await signIn(reader, actor);
      for (const [threadId, empty] of [[emptyId, true], [literalId, false]] as const) {
        const unread = empty || actor === 'reader';
        const path = `/v1/threads/${threadId}`;
        const [initial] = await Promise.all([responseAt(reader, path),
          reader.goto(`/#/mailboxes/${seed.mailboxes.primary}/threads/${threadId}`)]);
        await read(initial, threadId, empty, unread);
        await rendered(reader, empty, unread);
        const [reloaded] = await Promise.all([responseAt(reader, path), reader.reload()]);
        await read(reloaded, threadId, empty, unread);
        await rendered(reader, empty, unread);
      }
    } finally { await context.close(); }
  }
  expect(external).toBe(0);
  expect(readWrites).toBe(0);
  record.assertions.push('Real committed null/empty metadata and empty/hostile bodies render as exact child-free plaintext before and after reload for two independent actors');
  record.assertions.push('No external HTTP request attempted, hostile DOM/link created or script sentinel executed; external requests blocked without fabricated business responses');
  record.assertions.push('Eight real GET responses preserve expected actor-specific unread state; no browser read-state writes observed');
  record.evidence.push('API/UI observation only: physical row counts, versions/timestamps, long-content and non-Chromium partitions are not claimed');
});
