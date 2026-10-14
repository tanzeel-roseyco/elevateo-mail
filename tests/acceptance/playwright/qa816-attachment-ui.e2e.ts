import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { transportBarrier } from './transport-barrier.js';
import { mailbox, openThread, responseAt, screenshot, seed, signIn } from './support.js';

const uuid = z.uuid();
const fixtureSchema = z.strictObject({ schema_version: z.literal(1), kind: z.literal('qa816_attachment_bytes'),
  mailbox_id: uuid, thread_id: uuid, message_id: uuid,
  foreign: z.strictObject({ mailbox_id: uuid, thread_id: uuid, message_id: uuid, attachment_id: uuid }),
  clean: z.strictObject({ id: uuid, filename: z.string().regex(/^[A-Za-z0-9._-]{1,120}$/),
    byte_size: z.number().int().min(1).max(10_485_760), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
  held_id: uuid, rejected_id: uuid });

// AIDEV-NOTE: The same trusted task-private receipt used by the byte API cases is mandatory for UI acceptance.
function fixture() {
  const path = process.env.QA816_ATTACHMENT_PATH;
  if (path !== '/acceptance/qa816-attachments.json') throw new Error('QA816 attachment sidecar unavailable');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077) !== 0)
    throw new Error('QA816 attachment sidecar invalid');
  const value = fixtureSchema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  if (value.mailbox_id !== seed.mailboxes.primary || value.thread_id !== seed.data.thread_primary ||
      value.foreign.mailbox_id !== seed.mailboxes.other || value.foreign.thread_id !== seed.data.thread_other ||
      value.foreign.message_id === value.message_id || value.foreign.attachment_id === value.clean.id)
    throw new Error('QA816 attachment sidecar scope mismatch');
  return value;
}

async function attachmentsAtMobile(page: Parameters<typeof signIn>[0], messageId: string) {
  await signIn(page, 'reader');
  await page.setViewportSize({ width: 390, height: 844 });
  await mailbox(page);
  await openThread(page);
  const region = page.locator(`section[aria-label="Attachments for message ${messageId}"]`);
  await expect(region.getByRole('button', { name: /^Show \d+ attachments?$/ })).toBeVisible();
  return region;
}

scenario('SCN-QA-829-P', 'real-attachment-list-and-private-browser-download', async (page, record) => {
  const value = fixture();
  const region = await attachmentsAtMobile(page, value.message_id);
  const listPath = `/v2/mailboxes/${value.mailbox_id}/threads/${value.thread_id}/messages/${value.message_id}/attachments`;
  const [listed] = await Promise.all([responseAt(page, listPath), region.getByRole('button', { name: /^Show \d+ attachments?$/ }).click()]);
  expect(listed.status()).toBe(200);
  await expect(region.getByText('Pending security scan; download held', { exact: false })).toBeVisible();
  await expect(region.getByText('Rejected before storage; download unavailable', { exact: false })).toBeVisible();
  await expect(region.getByRole('button', { name: /^Download / })).toHaveCount(1);
  record.artifacts.push(await screenshot(page, 'QA816-ATT-P-list-390'));
  const contentPath = `${listPath}/${value.clean.id}/content`;
  const [content, download] = await Promise.all([responseAt(page, contentPath), page.waitForEvent('download'),
    region.getByRole('button', { name: `Download ${value.clean.filename}` }).press('Enter')]);
  expect(content.status()).toBe(200);
  expect(download.suggestedFilename()).toBe(value.clean.filename);
  expect(await download.failure()).toBeNull();
  const bytes = readFileSync(await download.path());
  expect(bytes.length).toBe(value.clean.byte_size);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(value.clean.sha256);
  await expect(region.getByRole('button', { name: `Download ${value.clean.filename}` })).toBeEnabled();
  record.artifacts.push(await screenshot(page, 'QA816-ATT-P-downloaded-390'));
  record.assertions.push('Real V2 list200 displayed clean/held/rejected states; only clean download control emitted real V2 content200 and browser bytes matching private SHA-256/length');
});

scenario('SCN-QA-829-F1', 'real-attachment-loading-and-controlled-transport-loss', async (page, record) => {
  const value = fixture();
  const region = await attachmentsAtMobile(page, value.message_id);
  const listPath = `/v2/mailboxes/${value.mailbox_id}/threads/${value.thread_id}/messages/${value.message_id}/attachments`;
  const held = await transportBarrier(page, listPath, 'GET', 'hold-response');
  try {
    await region.getByRole('button', { name: /^Show \d+ attachments?$/ }).click();
    expect(await held.reached).toBe(200);
    await expect(region.getByRole('status').getByText('Loading attachments…')).toBeVisible();
    record.artifacts.push(await screenshot(page, 'QA816-ATT-F1-loading-390'));
    held.release();
    await held.close();
    await expect(region.getByRole('button', { name: `Download ${value.clean.filename}` })).toBeVisible();
  } finally { await held.close(); }
  await page.reload();
  const reset = page.locator(`section[aria-label="Attachments for message ${value.message_id}"]`);
  await expect(reset.getByRole('button', { name: /^Show \d+ attachments?$/ })).toBeVisible();
  const loss = await transportBarrier(page, listPath, 'GET', 'no-forward');
  try {
    await reset.getByRole('button', { name: /^Show \d+ attachments?$/ }).click();
    expect(await loss.reached).toBeNull();
    loss.release();
    await loss.close();
    await expect(reset.getByRole('alert').getByText('Attachments could not be loaded.', { exact: false })).toBeVisible();
    record.artifacts.push(await screenshot(page, 'QA816-ATT-F1-error-390'));
    const [retried] = await Promise.all([responseAt(page, listPath), reset.getByRole('button', { name: 'Retry attachments' }).click()]);
    expect(retried.status()).toBe(200);
    await expect(reset.getByRole('button', { name: `Download ${value.clean.filename}` })).toBeVisible();
  } finally { await loss.close(); }
  record.assertions.push('Controlled held real GET200 exposed loading; controlled no-forward loss exposed retryable error, then real V2 retry200 settled metadata');
  record.evidence.push('Fault injection held actual upstream response and separately aborted an unforwarded request; no metadata or bytes were fabricated');
});
