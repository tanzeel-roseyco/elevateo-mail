import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { responseAt, screenshot, seed, signIn } from './support.js';

// AIDEV-NOTE: Each approval uses a case-owned new draft; no seeded or shared draft is consumed.
scenario('SCN-QA-816-P', 'real-auth-simulated-send-mobile-and-desktop', async (page, record) => {
  await signIn(page, 'manager_primary');
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts`);
  await page.getByRole('button', { name: 'New draft', exact: true }).click();
  const draftId = /\/drafts\/([0-9a-f-]{36})/.exec(new URL(page.url()).hash)?.[1];
  if (!draftId) throw new Error('New draft route missing');
  const subject = `${seed.data.marker} QA816 individual correspondence`;
  const body = `${seed.data.marker}\nQA816 simulated correspondence only.`;
  await page.getByLabel('Subject', { exact: true }).fill(subject);
  await page.getByLabel('To', { exact: true }).fill('recipient@acceptance.test');
  await page.getByLabel('Message', { exact: true }).fill(body);
  const [saved] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`, 'PUT'), page.getByRole('button', { name: 'Save draft', exact: true }).click()]);
  expect(saved.status()).toBe(200);
  await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
  const [review] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}/send-review`), page.getByRole('link', { name: 'Review simulated send' }).click()]);
  expect(review.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Review saved draft version 1' })).toBeVisible();
  await expect(page.getByText(subject, { exact: true })).toBeVisible();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await expect(page.getByText('Simulated — no live mail')).toBeVisible();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('button', { name: 'Approve simulated send' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve simulated send' })).toBeDisabled();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    record.artifacts.push(await screenshot(page, `QA816-SEND-P-review-${viewport.width}`));
  }
  await page.getByRole('checkbox', { name: /I confirm this is individual correspondence/ }).check();
  const [approval] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}/send-approvals`, 'POST'), page.getByRole('button', { name: 'Approve simulated send' }).click()]);
  expect([200, 201, 202]).toContain(approval.status());
  await expect(page.getByRole('heading', { name: /^Send intent:/ })).toBeVisible();
  await expect(page.getByText('Simulated — no live mail')).toBeVisible();
  const sendId = /\/send-intents\/([0-9a-f-]{36})/.exec(new URL(page.url()).hash)?.[1];
  if (!sendId) throw new Error('Send intent route missing');
  const [status] = await Promise.all([responseAt(page, `/v1/send-intents/${sendId}`), page.reload()]);
  expect(status.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /^Send intent:/ })).toBeVisible();
  record.artifacts.push(await screenshot(page, 'QA816-SEND-P-status-mobile'));
  record.assertions.push('Real auth, saved draft, review, explicit approval and reloaded status use API responses; narrow and desktop review have no horizontal overflow');
  record.evidence.push('Observed draft PUT 200, review GET 200, approval POST 2xx and status GET 200; no response body or credential retained');
});

scenario('SCN-QA-816-F1', 'reader-cannot-approve-or-manage', async (page, record) => {
  await signIn(page, 'reader');
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/members`);
  await expect(page.getByText('You cannot manage members of this mailbox')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New draft', exact: true })).toHaveCount(0);
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts/${seed.data.draft_primary}/send-review`);
  await expect(page.getByRole('button', { name: 'Approve simulated send' })).toHaveCount(0);
  record.assertions.push('Reader cannot manage members and cannot reach an actionable simulated approval');
});

scenario('SCN-QA-816-F2', 'logout-clears-send-review-and-mobile-session', async (page, record) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, 'manager_primary');
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts`);
  await page.getByRole('button', { name: 'Account and sign-out' }).click();
  const [logout] = await Promise.all([responseAt(page, '/v1/auth/logout', 'POST'),
    page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click()]);
  expect(logout.ok()).toBe(true);
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts`);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await page.request.get('/v1/session', { maxRedirects: 0 })).status()).toBe(401);
  record.assertions.push('Mobile browser logout revokes real session and protects deep-linked drafts');
});
