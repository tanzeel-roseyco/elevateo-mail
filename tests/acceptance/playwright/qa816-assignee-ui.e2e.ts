import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { transportBarrier } from './transport-barrier.js';
import { mailbox, openThread, responseAt, screenshot, seed, signIn } from './support.js';

const optionsPath = `/v2/mailboxes/${seed.mailboxes.primary}/assignee-options`;
const assignmentPath = `/v1/threads/${seed.data.thread_primary}/assignment`;

async function threadAtMobile(page: Parameters<typeof signIn>[0]) {
  await signIn(page, 'reader');
  await page.setViewportSize({ width: 390, height: 844 });
  await mailbox(page);
  await openThread(page);
  await expect(page.getByText('Unassigned', { exact: true })).toBeVisible();
}

// AIDEV-NOTE: The real V2 directory only presents UUID choices; the V1 write decides permission and revision.
scenario('SCN-QA-828-P', 'keyboard-picker-real-assignment-persists', async (page, record) => {
  await threadAtMobile(page);
  const choice = page.getByRole('button', { name: 'Choose assignee' });
  await choice.focus();
  await expect(choice).toBeFocused();
  const [options] = await Promise.all([responseAt(page, optionsPath), choice.press('Enter')]);
  expect(options.status()).toBe(200);
  const target = page.getByRole('button', { name: `Assign to user ${seed.actors.composer.user_id}` });
  await expect(target).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Eligible mailbox users' })).toBeVisible();
  record.artifacts.push(await screenshot(page, 'QA816-DIR-P-picker-390'));
  try {
    await target.focus();
    await expect(target).toBeFocused();
    const [saved] = await Promise.all([responseAt(page, assignmentPath, 'PUT'), target.press('Enter')]);
    expect(saved.status()).toBe(200);
    await expect(page.getByText(`Assigned to user ${seed.actors.composer.user_id}`, { exact: true })).toBeVisible();
    const [reloaded] = await Promise.all([responseAt(page, assignmentPath), page.reload()]);
    expect(reloaded.status()).toBe(200);
    await expect(page.getByText(`Assigned to user ${seed.actors.composer.user_id}`, { exact: true })).toBeVisible();
    record.artifacts.push(await screenshot(page, 'QA816-DIR-P-assigned-390'));
    record.assertions.push('Keyboard V2 UUID choice led to real V1 PUT200 and persisted assignment after real GET200 reload');
  } finally {
    // The task DB is disposable, but restore this case-owned assignment for later cases.
    const clear = page.getByRole('button', { name: 'Clear assignment' });
    if (await clear.isVisible()) {
      const [restored] = await Promise.all([responseAt(page, assignmentPath, 'PUT'), clear.click()]);
      expect(restored.status()).toBe(200);
    }
  }
});

scenario('SCN-QA-828-F1', 'picker-real-loading-and-controlled-transport-loss', async (page, record) => {
  await threadAtMobile(page);
  const held = await transportBarrier(page, optionsPath, 'GET', 'hold-response');
  try {
    await page.getByRole('button', { name: 'Choose assignee' }).click();
    expect(await held.reached).toBe(200);
    await expect(page.getByRole('status').getByText('Loading assignee choices…')).toBeVisible();
    record.artifacts.push(await screenshot(page, 'QA816-DIR-F1-loading-390'));
    held.release();
    await held.close();
    await expect(page.getByRole('button', { name: `Assign to user ${seed.actors.composer.user_id}` })).toBeVisible();
  } finally { await held.close(); }
  await page.getByRole('button', { name: 'Close assignee choices' }).click();
  const loss = await transportBarrier(page, optionsPath, 'GET', 'no-forward');
  try {
    await page.getByRole('button', { name: 'Choose assignee' }).click();
    expect(await loss.reached).toBeNull();
    loss.release();
    await loss.close();
    await expect(page.getByRole('button', { name: 'Try assignee choices again' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
    record.artifacts.push(await screenshot(page, 'QA816-DIR-F1-error-390'));
    const [retried] = await Promise.all([responseAt(page, optionsPath),
      page.getByRole('button', { name: 'Try assignee choices again' }).click()]);
    expect(retried.status()).toBe(200);
    await expect(page.getByRole('button', { name: `Assign to user ${seed.actors.composer.user_id}` })).toBeVisible();
  } finally { await loss.close(); }
  record.assertions.push('Controlled held real GET200 exposed loading; controlled no-forward loss exposed error, then real retry200 restored choices');
  record.evidence.push('Fault injection held an actual upstream response and separately aborted an unforwarded request; no business row was fabricated');
});
