import { lstatSync, readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { responseAt, screenshot, seed, signIn } from './support.js';

const uuid = z.string().uuid();
const sidecarSchema = z.strictObject({
  schema_version: z.literal(1), kind: z.literal('qa816_later_page'),
  mailbox_id: uuid, thread_id: uuid, message_id: uuid,
  marker: z.string().regex(/^QA816_LATER_[0-9a-f]{24}$/),
  message_count: z.literal(21), first_page_limit: z.literal(20),
});
const firstPageSchema = z.object({
  messages: z.array(z.object({ id: uuid }).passthrough()).length(20),
  next_cursor: z.string().min(1),
}).passthrough();

// AIDEV-NOTE: Separate opt-in run; a missing sidecar is setup failure, never a skipped acceptance case.
function laterPage() {
  const path = process.env.QA816_LATER_PAGE_PATH;
  if (path !== '/acceptance/qa816-later-page.json') throw new Error('QA816 later-page sidecar unavailable');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077) !== 0)
    throw new Error('QA816 later-page sidecar invalid');
  const sidecar = sidecarSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (sidecar.mailbox_id !== seed.mailboxes.primary || sidecar.thread_id !== seed.data.thread_primary)
    throw new Error('QA816 later-page seed mismatch');
  return sidecar;
}

scenario('SCN-QA-824-P', 'later-page-direct-message-reload-mobile', async (page, record) => {
  const later = laterPage();
  await signIn(page, 'reader');
  await page.setViewportSize({ width: 375, height: 812 });
  const directPath = `/v2/threads/${later.thread_id}/messages/${later.message_id}`;
  const detailPath = `/v1/threads/${later.thread_id}`;
  const route = `/#/mailboxes/${later.mailbox_id}/threads/${later.thread_id}?message=${later.message_id}`;
  const [direct, detail] = await Promise.all([responseAt(page, directPath), responseAt(page, detailPath), page.goto(route)]);
  expect(direct.status()).toBe(200);
  expect(detail.status()).toBe(200);
  const firstPage = firstPageSchema.parse(await detail.json());
  expect(firstPage.messages.some(message => message.id === later.message_id)).toBe(false);
  await expect(page.locator('li[aria-label="Selected message"] pre').filter({ hasText: later.marker })).toBeVisible();
  await expect(page.getByText('21 messages in this conversation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show more messages' })).toBeVisible();
  record.artifacts.push(await screenshot(page, 'QA816-MESSAGE-P2-later-page-mobile'));
  await page.reload();
  await expect(page.locator('li[aria-label="Selected message"] pre').filter({ hasText: later.marker })).toBeVisible();
  record.assertions.push('Real V1 first page has 20 messages and a continuation cursor but lacks the target; V2 direct GET selects message 21 and survives reload');
});
