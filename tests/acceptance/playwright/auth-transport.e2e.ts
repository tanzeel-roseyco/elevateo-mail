import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { fillSignInCredentials } from './credential-origin.js';
import { loadCredentials } from './boundaries.js';
import { mailbox, responseAt, seed } from './support.js';

// AIDEV-NOTE: Only disposable browser routing drops transport; no fake Auth result or cookie is manufactured.
scenario('SCN-AUTH-001-F2', 'unforwarded-login-duplicate-and-real-retry', async (page, record) => {
  await page.goto('/');
  await fillSignInCredentials(page, seed.actors.manager_primary.email, loadCredentials().passwords.manager_primary);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const arrival = new Promise<void>(resolve => { entered = resolve; });
  let attempts = 0;
  let dropped = false;
  const path = 'http://app.test/v1/auth/login';
  await page.route(path, async route => {
    attempts += 1;
    if (attempts !== 1) { await route.continue(); return; }
    entered();
    // AIDEV-NOTE: A watchdog bounds the gate below the application's ten-second transport deadline.
    const watchdog = setTimeout(release, 5000);
    try { await gate; await route.abort('failed'); dropped = true; }
    finally { clearTimeout(watchdog); }
  });
  try {
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await arrival;
    await expect(page.getByRole('button', { name: 'Signing in…', exact: true })).toBeDisabled();
    // AIDEV-NOTE: requestSubmit dispatches a genuine submit event even while native controls are disabled.
    const submitted = await page.locator('form').evaluate(form => {
      let count = 0;
      const observe = (): void => { count += 1; };
      form.addEventListener('submit', observe);
      try { (form as HTMLFormElement).requestSubmit(); return count; }
      finally { form.removeEventListener('submit', observe); }
    });
    expect(submitted).toBe(1);
    release();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(dropped).toBe(true);
    expect(attempts).toBe(1);
    await expect(page.getByRole('button', { name: 'Account and sign-out' })).toHaveCount(0);
    await fillSignInCredentials(page, seed.actors.manager_primary.email, loadCredentials().passwords.manager_primary);
    const [response] = await Promise.all([responseAt(page, '/v1/auth/login', 'POST'),
      page.getByRole('button', { name: 'Sign in', exact: true }).click()]);
    expect(response.status()).toBe(200);
    expect(attempts).toBe(2);
    await mailbox(page);
    record.assertions.push('Pending login suppresses duplicate submit; unforwarded abort shows error; genuine retry authenticates');
    record.evidence.push('First POST aborted before forwarding; second POST returned actual backend 200; no Auth bodies retained');
  } finally { release(); await page.unroute(path); }
});
