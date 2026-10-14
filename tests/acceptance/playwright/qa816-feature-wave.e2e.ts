import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { mailbox, openThread, responseAt, screenshot, seed, signIn } from './support.js';

// AIDEV-NOTE: APP901 candidate; the top reply entry must bind an authorized sender, not only a thread id.
scenario('SCN-QA-825-P', 'top-reply-persists-sender-and-thread', async (page, record) => {
  await signIn(page, 'composer');
  await mailbox(page);
  await openThread(page);
  await page.getByRole('link', { name: 'Reply as draft' }).click();
  const draftId = /\/drafts\/([0-9a-f-]{36})/.exec(new URL(page.url()).hash)?.[1];
  if (!draftId) throw new Error('Top reply draft route missing');
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('sender@acceptance.test');
  await expect(page.getByRole('link', { name: 'Replying to a conversation' }))
    .toHaveAttribute('href', `#/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_primary}`);
  const body = `QA816 top reply ${randomUUID()}`;
  await page.getByLabel('Message', { exact: true }).fill(body);
  const [saved] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`, 'PUT'),
    page.getByRole('button', { name: 'Save draft', exact: true }).click()]);
  expect(saved.status()).toBe(200);
  const [reloaded] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`), page.reload()]);
  expect(reloaded.status()).toBe(200);
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('sender@acceptance.test');
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(body);
  await expect(page.getByRole('link', { name: 'Replying to a conversation' }))
    .toHaveAttribute('href', `#/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_primary}`);
  record.artifacts.push(await screenshot(page, 'QA816-REPLY-P-top-persisted'));
  record.assertions.push('Top reply prefilled seeded sender and thread; case-owned V1 PUT and reload GET persisted both');
});
