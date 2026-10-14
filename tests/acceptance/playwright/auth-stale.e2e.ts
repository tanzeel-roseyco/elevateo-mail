import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { mailbox, responseAt, seed, signIn } from './support.js';
import { transportBarrier } from './transport-barrier.js';

// AIDEV-NOTE: A genuine authorized list response is held before logout; stale content must never repopulate the UI.
scenario('SCN-AUTH-003-F2', 'real-pre-logout-list-response-retired', async (page, record) => {
  await signIn(page);
  await mailbox(page);
  const barrier = await transportBarrier(page, '/v1/mailboxes', 'GET', 'hold-response');
  try {
    // Reload starts a genuine new authenticated collection request while retaining a usable account menu.
    await page.reload();
    expect(await barrier.reached).toBe(200);
    await page.getByRole('button', { name: 'Account and sign-out' }).click();
    const [response] = await Promise.all([responseAt(page, '/v1/auth/logout', 'POST'),
      page.getByRole('dialog', { name: 'Account', exact: true })
        .getByRole('button', { name: 'Sign out', exact: true }).click()]);
    expect(response.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    barrier.release();
    await barrier.close();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.locator(`a[href="#/mailboxes/${seed.mailboxes.primary}"]`)).toHaveCount(0);
    await expect(page.locator('a[data-thread], pre')).toHaveCount(0);
    expect((await page.request.get('/v1/session', { maxRedirects: 0 })).status()).toBe(401);
    record.assertions.push('Actual pre-logout 200 mailbox response released after logout cannot restore protected data; real session is denied');
    record.evidence.push('Held real upstream response; no synthesized status/body/cookies and no database lock-order claim');
  } finally {
    await barrier.close();
  }
});
