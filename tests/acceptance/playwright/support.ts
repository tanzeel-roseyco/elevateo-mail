import { expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { fillSignInCredentials } from './credential-origin.js';
import { persistScreenshot } from './screenshots.js';
import { loadAcceptanceConfig, loadSeedContract } from '../shared/config.js';
import { loadCredentials } from './boundaries.js';

export const seed = (() => {
  try { return loadSeedContract(); }
  catch { throw new Error('Acceptance runtime seed unavailable or invalid'); }
})();
export type Actor = keyof typeof seed.actors;
// AIDEV-NOTE: Observe only endpoint/status; never attach login/session headers or bodies.
export function responseAt(page: Page, path: string, method = 'GET'): Promise<Response> {
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === 'http://app.test' && url.pathname === path && response.request().method() === method;
  });
}
export async function signIn(page: Page, actor: Actor = 'manager_primary'): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await fillSignInCredentials(page, seed.actors[actor].email, loadCredentials().passwords[actor]);
  const [result] = await Promise.all([responseAt(page, '/v1/auth/login', 'POST'),
    page.getByRole('button', { name: 'Sign in', exact: true }).click()]);
  // AIDEV-NOTE: Auth-banned users fail before session creation; removed mailbox access still permits org login.
  expect(result.status()).toBe(actor === 'disabled' ? 401 : actor === 'no_membership' ? 404 : 200);
  if (actor === 'disabled') {
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('Sign-in was not accepted. Check the email address and password, or recover access.');
    await expect(page.getByRole('button', { name: 'Account and sign-out' })).toHaveCount(0);
  } else if (actor === 'no_membership') {
    await expect(page.getByRole('heading', { name: 'No organization is available' })).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: 'Account and sign-out' })).toBeVisible();
  }
}
export async function mailbox(page: Page): Promise<void> {
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}`);
  await expect(page.getByRole('region', { name: 'Conversations', exact: true })).toBeVisible();
  await expect(page.locator(`a[data-thread][href="#/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_primary}"]`)).toBeVisible();
}
export async function openThread(page: Page): Promise<void> {
  await page.locator(`a[data-thread][href="#/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_primary}"]`).click();
  await expect(page.getByRole('article', { name: 'Conversation', exact: true })).toBeVisible();
  await expect(page.locator('pre').filter({ hasText: seed.data.marker }).first()).toBeVisible();
}
export async function screenshot(page: Page, id: string): Promise<string> {
  // AIDEV-NOTE: Visible logo decode is separate from data readiness; a broken brand image must fail visual QA.
  for (const mark of await page.getByTestId('brand-mark').locator('img').all()) {
    if (await mark.isVisible()) {
      await expect.poll(() => mark.evaluate(image => image instanceof HTMLImageElement
        && image.complete && image.naturalWidth > 0)).toBe(true);
    }
  }
  // AIDEV-NOTE: Callers prove data readiness; finish CSS transitions so captures show settled theme colors.
  const config = loadAcceptanceConfig();
  const bytes = await page.screenshot({ fullPage: false, animations: 'disabled' });
  return persistScreenshot(config.outputDir, id, bytes, config.limits.artifactBytes);
}
