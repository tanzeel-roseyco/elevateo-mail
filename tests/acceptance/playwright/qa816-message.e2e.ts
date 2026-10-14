import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { mailbox, openThread, responseAt, screenshot, seed, signIn } from './support.js';
import { transportBarrier } from './transport-barrier.js';

// AIDEV-NOTE: These are same-page and absent-message checks; a later-page seed is separately required.
scenario('SCN-QA-823-P', 'message-permalink-reload-keyboard-mobile', async (page, record) => {
  await signIn(page, 'reader');
  await page.setViewportSize({ width: 375, height: 812 });
  await mailbox(page);
  await openThread(page);
  const link = page.getByRole('link', { name: 'Open this message' }).first();
  await link.focus();
  await expect(link).toBeFocused();
  await link.press('Enter');
  await expect(link).toHaveAttribute('aria-current', 'location');
  await expect(page.locator('li[aria-label="Selected message"] pre').filter({ hasText: seed.data.marker })).toBeVisible();
  const permalink = page.url();
  expect(new URL(permalink).hash).toMatch(/\?message=[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.locator('li[aria-label="Selected message"] pre').filter({ hasText: seed.data.marker })).toBeVisible();
  await expect(page.locator('li[aria-label="Selected message"]')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Back to conversations' })).toHaveAttribute('href', `#/mailboxes/${seed.mailboxes.primary}`);
  record.artifacts.push(await screenshot(page, 'QA816-MESSAGE-P-mobile'));
  record.assertions.push('Mobile keyboard message permalink reloads the seeded plaintext and focuses the selected message');
});

scenario('SCN-QA-823-F1', 'absent-message-direct-read-is-unavailable', async (page, record) => {
  await signIn(page, 'reader');
  const absentId = randomUUID();
  const path = `/v2/threads/${seed.data.thread_primary}/messages/${absentId}`;
  const [missing] = await Promise.all([responseAt(page, path),
    page.goto(`/#/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_primary}?message=${absentId}`)]);
  expect(missing.status()).toBe(404);
  await expect(page.getByText('This message is unavailable in this conversation.')).toBeVisible();
  await expect(page.locator('li[aria-label="Selected message"]')).toHaveCount(0);
  record.artifacts.push(await screenshot(page, 'QA816-MESSAGE-F1-unavailable'));
  record.assertions.push('Real V2 direct-message 404 shows unavailable state without inventing selected plaintext');
});

scenario('SCN-QA-823-F2', 'direct-message-transport-loss-real-retry', async (page, record) => {
  await signIn(page, 'reader');
  const absentId = randomUUID();
  const path = `/v2/threads/${seed.data.thread_primary}/messages/${absentId}`;
  const loss = await transportBarrier(page, path, 'GET', 'no-forward');
  try {
    await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_primary}?message=${absentId}`);
    expect(await loss.reached).toBeNull();
    loss.release();
    await loss.close();
    await expect(page.getByRole('alert').getByText('The message could not be loaded.')).toBeVisible();
    record.artifacts.push(await screenshot(page, 'QA816-MESSAGE-F2-error'));
  } finally { await loss.close(); }
  const [retry] = await Promise.all([responseAt(page, path), page.getByRole('button', { name: 'Retry message' }).click()]);
  expect(retry.status()).toBe(404);
  await expect(page.getByText('This message is unavailable in this conversation.')).toBeVisible();
  record.assertions.push('Direct-message transport loss shows error; explicit retry reaches the real API and resolves as unavailable');
});
