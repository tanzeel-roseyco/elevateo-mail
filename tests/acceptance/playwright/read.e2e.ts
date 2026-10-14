import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { mailbox, openThread, responseAt, screenshot, seed, signIn } from './support.js';

// AIDEV-NOTE: Seed marker must occur in the primary plaintext message; bodies remain inside the browser.
scenario('SCN-READ-002-P', 'seeded-plaintext-reload-back', async (page, record) => {
  await signIn(page, 'reader');
  await mailbox(page);
  await openThread(page);
  await page.reload();
  await expect(page.locator('pre').filter({ hasText: seed.data.marker }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Back to conversations' }).click();
  await expect(page.locator(`a[data-thread][href$="/threads/${seed.data.thread_primary}"]`)).toBeVisible();
  record.assertions.push('Seeded plaintext renders, survives reload and returns to its mailbox list');
});
scenario('SCN-READ-002-F1', 'foreign-thread-target', async (page, record) => {
  await signIn(page, 'reader');
  await mailbox(page);
  await openThread(page);
  const [response] = await Promise.all([responseAt(page, `/v1/threads/${seed.data.thread_other}`),
    page.goto(`/#/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_other}`)]);
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'This conversation is unavailable' })).toBeVisible();
  await expect(page.locator('pre')).toHaveCount(0);
  record.artifacts.push(await screenshot(page, 'SCN-READ-002-F1-unavailable'));
  record.assertions.push('Foreign thread returns generic 404 and removes prior plaintext');
});
scenario('SCN-GUI-006-P', 'real-reader-search-history-four-visual-partitions', async (page, record) => {
  await signIn(page, 'reader');
  let requests = 0;
  const count = (): void => { requests += 1; };
  page.on('request', count);
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        const started = Date.now();
        const before = requests;
        await mailbox(page);
        record.artifacts.push(await screenshot(page, `SCN-GUI-006-P-inbox-${viewport.width}-${colorScheme}`));
        await openThread(page);
        await expect(page.getByRole('article', { name: 'Conversation', exact: true }).getByRole('heading', { level: 1 })).toBeFocused();
        await expect(page.locator('a[aria-current="page"]')).toHaveCount(0);
        await page.goBack();
        await expect(page.locator('a[data-thread]').first()).toBeVisible();
        await page.goForward();
        await expect(page.locator('pre').filter({ hasText: seed.data.marker }).first()).toBeVisible();
        await page.reload();
        await expect(page.locator('pre').filter({ hasText: seed.data.marker }).first()).toBeVisible();
        record.artifacts.push(await screenshot(page, `SCN-GUI-006-P-${viewport.width}-${colorScheme}`));
        await page.goto('/#/search');
        const search = page.getByRole('search', { name: 'Search conversations', exact: true });
        await expect(search).toBeVisible();
        await search.getByLabel('Search mail', { exact: true }).fill(seed.data.marker);
        await search.getByLabel('Search scope', { exact: true }).selectOption(seed.mailboxes.primary);
        const [response] = await Promise.all([responseAt(page, '/v1/search'),
          search.getByLabel('Search mail', { exact: true }).press('Enter')]);
        expect(response.status()).toBe(200);
        await expect(page.getByRole('region', { name: 'Search results' }).locator(`a[data-thread][href$="/threads/${seed.data.thread_primary}"]`)).toBeVisible();
        await search.getByLabel('Search mail', { exact: true }).blur();
        await page.goBack();
        await expect(search.getByLabel('Search mail', { exact: true })).toHaveValue('');
        await page.goForward();
        await expect(search.getByLabel('Search mail', { exact: true })).toHaveValue(seed.data.marker);
        await expect(search.getByLabel('Search scope', { exact: true })).toHaveValue(seed.mailboxes.primary);
        record.artifacts.push(await screenshot(page, `SCN-GUI-006-P-search-${viewport.width}-${colorScheme}`));
        record.evidence.push(`Observed ${viewport.width}x${viewport.height} ${colorScheme}: reader/search/history ${Date.now() - started}ms, ${requests - before} browser requests; no latency threshold claim`);
      }
    }
    record.assertions.push('Four real visual partitions retain reader history/focus and plaintext; search uses keyboard, genuine API200 and URL history/scope on mobile and desktop');
  } finally { page.off('request', count); }
});
scenario('SCN-GUI-006-F2', 'production-fixture-entry-absence-only', async (page, record) => {
  for (const path of ['/dev-fixtures.html', '/src/dev/fixtureMain.tsx']) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect([404, 410].includes(response.status())).toBe(true);
  }
  record.assertions.push('Production fixture HTML and source entry are absent; callback inspection not covered');
});
