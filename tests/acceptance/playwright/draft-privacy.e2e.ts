import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { z } from 'zod';
import { draftReceipt } from './boundaries.js';
import { scenario } from './cases.js';
import { responseAt, seed, signIn } from './support.js';

const token = z.string().min(1).max(2048);
const pageSchema = z.strictObject({ context_id: token, authorization_version: token,
  mailbox_id: z.uuid(), next_cursor: token.nullable(), items: z.array(z.strictObject({
    id: z.uuid(), mailbox_id: z.uuid(), subject: z.string().max(512), subject_truncated: z.boolean(),
    reply_to_thread_id: z.uuid().nullable(), version: z.number().int().positive(),
    state: z.enum(['editable', 'consumed']), updated_at: z.iso.datetime(),
  })).max(50) });

async function list(response: Response): Promise<z.infer<typeof pageSchema>> {
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']?.includes('application/json')).toBe(true);
  const bytes = await response.body();
  expect(bytes.length).toBeLessThanOrEqual(262144);
  const parsed = pageSchema.safeParse(JSON.parse(bytes.toString('utf8')) as unknown);
  if (!parsed.success) throw new Error('Draft list contract rejected');
  expect(parsed.data.mailbox_id).toBe(seed.mailboxes.primary);
  return parsed.data;
}

async function create(page: Page, sentinel: string): Promise<string> {
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts`);
  await page.getByRole('button', { name: 'New draft', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill(sentinel);
  await page.getByLabel('To', { exact: true }).fill('recipient@acceptance.test');
  await page.getByLabel('Message', { exact: true }).fill(sentinel);
  const id = /\/drafts\/([0-9a-f-]{36})(?:\?|$)/.exec(new URL(page.url()).hash)?.[1];
  if (!id) throw new Error('Draft route missing');
  const [saved] = await Promise.all([responseAt(page, `/v1/drafts/${id}`, 'PUT'),
    page.getByRole('button', { name: 'Save draft', exact: true }).click()]);
  expect(saved.status()).toBe(200);
  expect(draftReceipt(await saved.json() as unknown)).toEqual({ draft_id: id, version: 1 });
  await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(sentinel);
  return id;
}

// AIDEV-NOTE: Separate genuine browser sessions prove privacy between composers of the same mailbox.
scenario('SCN-DRAFT-008-F1', 'same-mailbox-author-private-draft', async (page, record) => {
  const context = await page.context().browser()?.newContext({ baseURL: 'http://app.test' });
  if (!context) throw new Error('Isolated context unavailable');
  try {
    const peer = await context.newPage();
    await signIn(page, 'composer');
    await signIn(peer, 'approver');
    const privateText = `Private acceptance ${randomUUID()}`;
    const ownText = `Own acceptance ${randomUUID()}`;
    const privateId = await create(page, privateText);
    const ownId = await create(peer, ownText);
    const [initial] = await Promise.all([responseAt(peer, '/v1/drafts'),
      peer.getByRole('link', { name: 'Back to drafts', exact: true }).click()]);
    let current = await list(initial);
    let sawOwn = false;
    const cursors = new Set<string>();
    for (let index = 0; index < 10; index += 1) {
      for (const item of current.items) {
        expect(item.id === privateId || item.subject.includes(privateText)).toBe(false);
        expect(item.mailbox_id).toBe(seed.mailboxes.primary);
        if (item.id === ownId) sawOwn = true;
      }
      if (current.next_cursor === null) break;
      expect(index).toBeLessThan(9);
      expect(cursors.has(current.next_cursor)).toBe(false);
      cursors.add(current.next_cursor);
      const [next] = await Promise.all([responseAt(peer, '/v1/drafts'),
        peer.getByRole('button', { name: 'Show more drafts', exact: true }).click()]);
      current = await list(next);
    }
    expect(current.next_cursor).toBeNull();
    expect(sawOwn).toBe(true);
    await expect(peer.locator(`a[href$="/drafts/${ownId}"]`)).toBeVisible();
    const denials: { code: string; message: string }[] = [];
    for (const id of [privateId, randomUUID()]) {
      const [denied] = await Promise.all([responseAt(peer, `/v1/drafts/${id}`),
        peer.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts/${id}`)]);
      expect(denied.status()).toBe(404);
      const bytes = await denied.body();
      expect(bytes.length).toBeLessThanOrEqual(65536);
      expect(denied.headers()['content-type']?.includes('application/json')).toBe(true);
      const error = z.strictObject({ code: z.literal('not_available'), message: z.string().max(512),
        request_id: z.string().min(1).max(256) })
        .safeParse(JSON.parse(bytes.toString('utf8')) as unknown);
      if (!error.success) throw new Error("Draft denial contract rejected");
      denials.push({ code: error.data.code, message: error.data.message });
      expect(bytes.toString('utf8').includes(privateText)).toBe(false);
      await expect(peer.getByRole('heading', { name: 'This draft is unavailable', exact: true })).toBeVisible();
      await expect(peer.getByLabel('Subject', { exact: true })).toHaveCount(0);
      await expect(peer.getByText(privateText, { exact: true })).toHaveCount(0);
    }
    expect(denials[0]).toEqual(denials[1]);
    await page.reload();
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(privateText);
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(privateText);
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    record.assertions.push('Both actors save real same-mailbox drafts; complete peer list excludes author draft; private and nonexistent detail deny identically; author reload remains intact');
  } finally {
    await context.close();
  }
});
