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
scenario('SCN-GUI-006-P', 'reader-history-focus-desktop-and-narrow', async (page, record) => {
  await signIn(page, 'reader');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await mailbox(page);
    await openThread(page);
    await expect(page.getByRole('article', { name: 'Conversation', exact: true }).getByRole('heading', { level: 1 })).toBeFocused();
    await page.goBack();
    await expect(page.locator('a[data-thread]').first()).toBeVisible();
    await page.goForward();
    await expect(page.locator('pre').filter({ hasText: seed.data.marker }).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('pre').filter({ hasText: seed.data.marker }).first()).toBeVisible();
    record.artifacts.push(await screenshot(page, `SCN-GUI-006-P-${width}`));
  }
  record.assertions.push('Both widths preserve real reader route through history and reload; ready thread heading receives focus');
});
scenario('SCN-GUI-006-F2', 'production-fixture-entry-absence-only', async (page, record) => {
  for (const path of ['/dev-fixtures.html', '/src/dev/fixtureMain.tsx']) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect([404, 410].includes(response.status())).toBe(true);
  }
  record.assertions.push('Production fixture HTML and source entry are absent; callback inspection not covered');
});
