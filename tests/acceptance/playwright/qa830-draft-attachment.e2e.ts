import { expect } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { responseAt, screenshot, seed, signIn } from './support.js';

// AIDEV-NOTE: Real API/private storage round trips cover the saved-draft panel independently of inbound attachments.
scenario('SCN-QA-830-P', 'saved-draft-attachment-roundtrip', async (page, record) => {
  await signIn(page, 'composer');
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts`);
  await page.getByRole('button', { name: 'New draft', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill(`${seed.data.marker} attachment`);
  await page.getByLabel('To', { exact: true }).fill('recipient@acceptance.test');
  await page.getByLabel('Message', { exact: true }).fill('Private synthetic attachment acceptance.');
  const draftId = /\/drafts\/([0-9a-f-]{36})(?:\?|$)/.exec(new URL(page.url()).hash)?.[1];
  if (!draftId) throw new Error('Draft route missing');
  const [saved] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`, 'PUT'),
    page.getByRole('button', { name: 'Save draft', exact: true }).click()]);
  expect(saved.status()).toBe(200);
  await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Draft attachment', exact: true });
  const input = panel.getByLabel('Choose attachment', { exact: true });
  await expect(input).toBeEnabled();
  // AIDEV-NOTE: Invalid local files must leave the panel usable for a subsequent real upload.
  for (const invalid of [
    { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
    { name: 'unsupported.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') },
  ]) {
    await input.setInputFiles(invalid);
    await expect(panel.getByRole('alert')).toContainText('Invalid files must be PDF, PNG, JPEG or text');
    await expect(input).toBeEnabled();
    await expect(panel.getByRole('button', { name: 'Remove attachment', exact: true })).toHaveCount(0);
  }
  const path = `/v1/drafts/${draftId}/attachments`;
  const bytes = Buffer.from('Synthetic private attachment.\n');
  const [uploaded] = await Promise.all([responseAt(page, path, 'POST'),
    input.setInputFiles({ name: 'acceptance.txt', mimeType: 'text/plain', buffer: bytes })]);
  expect(uploaded.status()).toBe(200);
  const receipt = z.object({ id: z.string().uuid(), filename: z.literal('acceptance.txt'),
    byte_size: z.literal(bytes.length), status: z.literal('pending_scan') }).parse(await uploaded.json());
  await expect(panel.getByText(`acceptance.txt (${bytes.length} bytes)`, { exact: true })).toBeVisible();
  await expect(panel.getByText('Waiting for security scan', { exact: true })).toBeVisible();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(panel.getByText(`acceptance.txt (${bytes.length} bytes)`, { exact: true })).toBeVisible();
  await expect(panel.getByText('Waiting for security scan', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  record.artifacts.push(await screenshot(page, 'QA830-DRAFT-ATT-uploaded-390'));
  const [removed] = await Promise.all([responseAt(page, `${path}/${receipt.id}`, 'DELETE'),
    panel.getByRole('button', { name: 'Remove attachment', exact: true }).click()]);
  expect(removed.status()).toBe(200);
  await expect(input).toBeEnabled();
  await page.reload();
  await expect(input).toBeEnabled();
  await expect(panel.getByText(`acceptance.txt (${bytes.length} bytes)`, { exact: true })).toHaveCount(0);
  await panel.scrollIntoViewIfNeeded();
  record.artifacts.push(await screenshot(page, 'QA830-DRAFT-ATT-removed-390'));
  record.assertions.push('Empty/unsupported files recover; real upload metadata and removal survive reload');
  record.evidence.push('Observed authenticated draft PUT, attachment POST/DELETE 200; no private bodies exported');
});
