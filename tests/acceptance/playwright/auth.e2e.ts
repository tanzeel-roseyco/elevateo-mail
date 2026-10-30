import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { loadCredentials } from './boundaries.js';
import { mailbox, responseAt, seed, signIn } from './support.js';

// AIDEV-NOTE: Fresh browser contexts isolate identities; credentials enter only the actual password control.
scenario('SCN-AUTH-001-P', 'password-login-primary-manager', async (page, record) => {
  await signIn(page);
  await mailbox(page);
  record.assertions.push('Real password login returned 200 and seeded authorized mailbox rendered');
  record.evidence.push('Observed POST /v1/auth/login status 200; no response body captured');
});
scenario('SCN-AUTH-001-F1', 'wrong-password-desktop-and-narrow', async (page, record) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByLabel('Email address', { exact: true }).fill(seed.actors.manager_primary.email);
    const valid = loadCredentials().passwords.manager_primary;
    const wrong = `${valid[0] === 'X' ? 'Y' : 'X'}${valid.slice(1)}`;
    await page.getByLabel('Password', { exact: true }).fill(wrong);
    const [response] = await Promise.all([responseAt(page, '/v1/auth/login', 'POST'),
      page.getByRole('button', { name: 'Sign in', exact: true }).click()]);
    expect(response.status()).toBe(401);
    await expect(page.getByRole('alert')).toHaveText('Sign-in was not accepted. Check the email address and password, or recover access.');
    await expect.poll(async () => (await page.getByLabel('Password', { exact: true }).inputValue()).length).toBe(0);
    expect(await page.getByLabel('Email address', { exact: true }).inputValue() === seed.actors.manager_primary.email).toBe(true);
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Account and sign-out' })).toHaveCount(0);
  }
  record.assertions.push('Both widths reject incorrect credentials, clear password, preserve email and expose accessible error');
});
scenario('SCN-AUTH-007-F1', 'initial-no-membership-denial', async (page, record) => {
  await signIn(page, 'no_membership');
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}`);
  await expect(page.getByRole('heading', { name: 'No organization is available' })).toBeVisible();
  await expect(page.locator('a[data-thread]')).toHaveCount(0);
  record.assertions.push('Identity without membership remains denied on protected deep link');
});
scenario('SCN-AUTH-003-P', 'logout-protected-reload', async (page, record) => {
  await signIn(page);
  await mailbox(page);
  await page.getByRole('button', { name: 'Account and sign-out' }).click();
  const [response] = await Promise.all([responseAt(page, '/v1/auth/logout', 'POST'),
    page.getByRole('dialog', { name: 'Account', exact: true })
      .getByRole('button', { name: 'Sign out', exact: true }).click()]);
  expect(response.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  const denied = await page.request.get('/v1/session', { maxRedirects: 0 });
  expect(denied.status()).toBe(401);
  await expect(page.locator('a[data-thread]')).toHaveCount(0);
  record.assertions.push('Logout clears protected UI; reload and real session endpoint deny access');
});
