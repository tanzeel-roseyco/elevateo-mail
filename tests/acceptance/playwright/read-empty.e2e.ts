import { expect } from '@playwright/test';
import type { Request } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { responseAt, screenshot, seed, signIn } from './support.js';

// AIDEV-NOTE: Empty membership is a real seeded Auth actor, distinct from the no-organization login denial.
const emptyPage = z.strictObject({ context_id: z.string().min(1).max(2048),
  authorization_version: z.string().min(1).max(2048), next_cursor: z.null(), items: z.array(z.never()).length(0) });

scenario('SCN-READ-001-F1', 'real-member-zero-visible-mailboxes', async (page, record) => {
  let mailboxRequests = 0;
  const count = (request: Request): void => {
    const url = new URL(request.url());
    if (url.origin === 'http://app.test' && url.pathname === '/v1/mailboxes' && request.method() === 'GET') {
      mailboxRequests += 1;
    }
  };
  page.on('request', count);
  try {
    const pending = responseAt(page, '/v1/mailboxes');
    const [response] = await Promise.all([pending, signIn(page, 'revoked')]);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']?.includes('application/json')).toBe(true);
    const bytes = await response.body();
    expect(bytes.length).toBeLessThanOrEqual(262144);
    expect(emptyPage.safeParse(JSON.parse(bytes.toString('utf8')) as unknown).success).toBe(true);
    await expect(page.getByText('No mailboxes are visible to you.', { exact: true })).toBeVisible();
    await expect(page.locator(`a[href="#/mailboxes/${seed.mailboxes.primary}"]`)).toHaveCount(0);
    await expect(page.locator('a[data-thread], pre')).toHaveCount(0);
    expect(mailboxRequests).toBe(1);
    // AIDEV-NOTE: Event rejection observes unsolicited retries; a deadline closes the negative observation window.
    await new Promise<void>((resolve, reject) => {
      const unexpected = (request: Request): void => {
        const url = new URL(request.url());
        if (url.origin === 'http://app.test' && url.pathname === '/v1/mailboxes' && request.method() === 'GET') {
          clearTimeout(deadline);
          page.off('request', unexpected);
          reject(new Error('Unsolicited mailbox request'));
        }
      };
      const deadline = setTimeout(() => { page.off('request', unexpected); resolve(); }, 2000);
      page.on('request', unexpected);
    });
    expect(mailboxRequests).toBe(1);
    const denied = responseAt(page, `/v1/mailboxes/${seed.mailboxes.primary}/threads`);
    await page.goto(`/#/mailboxes/${seed.mailboxes.primary}`);
    expect((await denied).status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'This mailbox is unavailable', exact: true })).toBeVisible();
    await expect(page.locator('a[data-thread], pre')).toHaveCount(0);
    record.artifacts.push(await screenshot(page, 'SCN-READ-001-F1-empty-denied'));
    record.assertions.push('Real login succeeds; complete mailbox collection is empty with no unsolicited retry; deep link exposes no thread data');
    record.evidence.push('Static zero-mailbox membership partition only; no live revocation or malformed-response control exercised');
  } finally {
    page.off('request', count);
  }
});
