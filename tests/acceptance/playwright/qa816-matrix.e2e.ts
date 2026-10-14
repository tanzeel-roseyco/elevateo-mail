import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { scenario } from './cases.js';
import { mailbox, openThread, responseAt, screenshot, seed, signIn } from './support.js';
import { transportBarrier } from './transport-barrier.js';

// AIDEV-NOTE: Evidence is from real browser/API; screenshots follow settled content and omit credentials.
scenario('SCN-QA-817-P', 'inbox-permalink-history-keyboard-responsive', async (page, record) => {
  await signIn(page, 'reader');
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    const [list] = await Promise.all([responseAt(page, `/v1/mailboxes/${seed.mailboxes.primary}/threads`), mailbox(page)]);
    expect(list.status()).toBe(200);
    const link = page.locator(`a[data-thread][href$="/threads/${seed.data.thread_primary}"]`);
    await link.focus();
    await expect(link).toBeFocused();
    await link.press('Enter');
    await expect(page.getByRole('article', { name: 'Conversation', exact: true })).toBeVisible();
    await expect(page.locator('pre').filter({ hasText: seed.data.marker }).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('pre').filter({ hasText: seed.data.marker }).first()).toBeVisible();
    await page.goBack();
    await expect(page.locator('a[data-thread]').first()).toBeVisible();
    await page.goForward();
    await expect(page.locator('pre').filter({ hasText: seed.data.marker }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    record.artifacts.push(await screenshot(page, `QA816-READ-P-${width}`));
  }
  record.assertions.push('Real thread list and keyboard permalink survive reload/back/forward at desktop and two mobile browser widths');
  record.evidence.push('Observed authenticated GET mailbox threads 200 at each viewport; browser content marker stayed in rendered plaintext');
});

scenario('SCN-QA-817-F1', 'duplicate-save-click-is-one-version', async (page, record) => {
  await signIn(page, 'composer');
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts`);
  await page.getByRole('button', { name: 'New draft', exact: true }).click();
  const draftId = /\/drafts\/([0-9a-f-]{36})/.exec(new URL(page.url()).hash)?.[1];
  if (!draftId) throw new Error('New draft route missing');
  const marker = `QA816 duplicate ${randomUUID()}`;
  await page.getByLabel('Subject', { exact: true }).fill(marker);
  await page.getByLabel('To', { exact: true }).fill('recipient@acceptance.test');
  await page.getByLabel('Message', { exact: true }).fill(marker);
  let writes = 0;
  const count = (request: { url(): string; method(): string }): void => {
    if (new URL(request.url()).pathname === `/v1/drafts/${draftId}` && request.method() === 'PUT') writes += 1;
  };
  page.on('request', count);
  try {
    const button = page.getByRole('button', { name: 'Save draft', exact: true });
    const first = responseAt(page, `/v1/drafts/${draftId}`, 'PUT');
    await button.dblclick();
    expect((await first).status()).toBe(200);
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    await page.reload();
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(marker);
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
  } finally { page.off('request', count); }
  record.assertions.push('Rapid duplicate save gesture sends one PUT and leaves one persisted draft version after reload');
});

scenario('SCN-QA-817-F2', 'unavailable-reader-path-and-search-empty', async (page, record) => {
  await signIn(page, 'reader');
  await mailbox(page);
  await openThread(page);
  const [denied] = await Promise.all([responseAt(page, `/v1/threads/${seed.data.thread_other}`),
    page.goto(`/#/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_other}`)]);
  expect(denied.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'This conversation is unavailable' })).toBeVisible();
  await expect(page.locator('pre')).toHaveCount(0);
  record.artifacts.push(await screenshot(page, 'QA816-READ-F1-denied'));
  await page.goto('/#/search');
  const search = page.getByRole('search', { name: 'Search conversations', exact: true });
  await search.getByLabel('Search mail', { exact: true }).fill(`absent-${randomUUID()}`);
  await search.getByLabel('Search scope', { exact: true }).selectOption(seed.mailboxes.primary);
  const [result] = await Promise.all([responseAt(page, '/v1/search'), search.getByLabel('Search mail', { exact: true }).press('Enter')]);
  expect(result.status()).toBe(200);
  await expect(page.getByRole('region', { name: 'Search results' }).locator('a[data-thread]')).toHaveCount(0);
  record.artifacts.push(await screenshot(page, 'QA816-READ-F1-empty-search'));
  record.assertions.push('Foreign thread yields real 404 with prior plaintext cleared; unique search uses real API and settles empty');
});

scenario('SCN-QA-818-P', 'branded-shell-keyboard-mobile-and-outreach-read', async (page, record) => {
  await signIn(page, 'manager_primary');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1280, height: 800 });
    await mailbox(page);
    await expect(page.getByRole('navigation', { name: 'Personal' })).toBeVisible();
    const outreach = page.getByRole('navigation', { name: 'Outreach' });
    await expect(outreach).toBeVisible();
    await expect(page.getByText('Elevateo Mail', { exact: true })).toBeVisible();
    await expect(outreach.getByRole('link', { name: 'Campaigns' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Personal' }).getByRole('link', { name: 'People' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Personal' }).getByRole('link', { name: 'Personal settings' })).toBeVisible();
    record.artifacts.push(await screenshot(page, `QA816-SHELL-P-desktop-${colorScheme}`));
    await outreach.getByRole('link', { name: 'Campaigns' }).focus();
    await expect(outreach.getByRole('link', { name: 'Campaigns' })).toBeFocused();
    await outreach.getByRole('link', { name: 'Campaigns' }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible();
    await expect(outreach.getByRole('link', { name: 'Campaigns' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Outreach is draft or paused. Sending and enrollment are unavailable.')).toBeVisible();
    record.artifacts.push(await screenshot(page, `QA816-SHELL-P-campaigns-${colorScheme}`));
  }
  await page.goto('/#/settings/personal');
  await expect(page.getByRole('heading', { name: 'Personal settings' })).toBeVisible();
  await expect(page.getByText('Signed in as', { exact: false })).toBeVisible();
  record.artifacts.push(await screenshot(page, 'QA816-SHELL-P-personal-settings'));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  await expect(drawer.getByRole('navigation', { name: 'Personal' })).toBeVisible();
  await expect(drawer.getByRole('navigation', { name: 'Outreach' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'People' })).toBeVisible();
  record.artifacts.push(await screenshot(page, 'QA816-SHELL-P-mobile-drawer'));
  record.assertions.push('Branded shell, two rail sections, keyboard Campaigns route and mobile drawer render at light/dark desktop and mobile browser width');
});


scenario('SCN-QA-818-F1', 'real-search-loading-transport-error-retry', async (page, record) => {
  await signIn(page, 'reader');
  await page.goto('/#/search');
  const search = page.getByRole('search', { name: 'Search conversations', exact: true });
  await search.getByLabel('Search mail', { exact: true }).fill(seed.data.marker);
  await search.getByLabel('Search scope', { exact: true }).selectOption(seed.mailboxes.primary);
  const barrier = await transportBarrier(page, '/v1/search', 'GET', 'hold-response');
  try {
    await search.getByLabel('Search mail', { exact: true }).press('Enter');
    expect(await barrier.reached).toBe(200);
    await expect(page.getByRole('status', { name: 'Searching' })).toBeVisible();
    record.artifacts.push(await screenshot(page, 'QA816-SEARCH-F2-loading'));
    barrier.release();
    await barrier.close();
    await expect(page.getByRole('region', { name: 'Search results' }).locator(`a[data-thread][href$="/threads/${seed.data.thread_primary}"]`)).toBeVisible();
  } finally { await barrier.close(); }
  const failure = await transportBarrier(page, '/v1/search', 'GET', 'no-forward');
  try {
    await search.getByLabel('Search mail', { exact: true }).fill(`error-${randomUUID()}`);
    await search.getByLabel('Search mail', { exact: true }).press('Enter');
    expect(await failure.reached).toBeNull();
    failure.release();
    await failure.close();
    await expect(page.getByRole('alert').getByText('The search could not be completed')).toBeVisible();
    record.artifacts.push(await screenshot(page, 'QA816-SEARCH-F2-error'));
    const [retry] = await Promise.all([responseAt(page, '/v1/search'), page.getByRole('button', { name: 'Try again' }).click()]);
    expect(retry.status()).toBe(200);
    await expect(page.getByText('No matches')).toBeVisible();
  } finally { await failure.close(); }
  record.assertions.push('Genuine held 200 search exposes loading; transport loss exposes error; real retry 200 settles empty');
  record.evidence.push('Held actual upstream response and aborted an unforwarded request; no fabricated business response');
});

scenario('SCN-QA-818-F2', 'chromium-visual-viewport-200-percent', async (page, record) => {
  await signIn(page, 'reader');
  await page.setViewportSize({ width: 375, height: 812 });
  await mailbox(page);
  const cdp = await page.context().newCDPSession(page);
  try {
    // AIDEV-NOTE: CDP scale is genuine Chromium visual viewport zoom; browser text zoom needs separate evidence.
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    const scale = await page.evaluate(() => window.visualViewport?.scale ?? 0);
    expect(scale).toBeGreaterThanOrEqual(1.99);
    expect(scale).toBeLessThanOrEqual(2.01);
    await expect(page.getByRole('region', { name: 'Conversations', exact: true })).toBeVisible();
    await expect(page.locator('a[data-thread]').first()).toBeVisible();
    record.artifacts.push(await screenshot(page, 'QA816-ZOOM-P-200-percent-visual-viewport'));
    record.assertions.push('Chromium visual viewport reports 200% scale with genuine seeded inbox controls visible');
  } finally {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await cdp.detach();
  }
});

scenario('SCN-QA-819-P', 'manager-roster-reader-denial', async (page, record) => {
  const path = `/v1/mailboxes/${seed.mailboxes.primary}/members`;
  await signIn(page, 'manager_primary');
  const [roster] = await Promise.all([responseAt(page, path), page.goto(`/#/mailboxes/${seed.mailboxes.primary}/members`)]);
  expect(roster.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
  await expect(page.getByText('Roster revision', { exact: false })).toBeVisible();
  record.artifacts.push(await screenshot(page, 'QA816-ADMIN-P-manager-roster'));
  const context = await page.context().browser()?.newContext({ baseURL: 'http://app.test' });
  if (!context) throw new Error('Reader context unavailable');
  try {
    const reader = await context.newPage();
    await signIn(reader, 'reader');
    const [denied] = await Promise.all([responseAt(reader, path), reader.goto(`/#/mailboxes/${seed.mailboxes.primary}/members`)]);
    expect([403, 404]).toContain(denied.status());
    await expect(reader.getByText('You cannot manage members of this mailbox')).toBeVisible();
    await expect(reader.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    record.artifacts.push(await screenshot(reader, 'QA816-ADMIN-P-reader-denied'));
  } finally { await context.close(); }
  record.assertions.push('Manager roster renders from real API 200; separate reader session receives API denial and nonactionable UI');
});

scenario('SCN-QA-819-F1', 'v2-organization-grants-reader-denial', async (page, record) => {
  const path = `/v2/organizations/${seed.organizations.primary}/grants`;
  await signIn(page, 'manager_primary');
  const [grants] = await Promise.all([responseAt(page, path), page.goto('/#/people')]);
  expect(grants.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
  await expect(page.getByText('Current grants loaded', { exact: false })).toBeVisible();
  await expect(page.getByText('These twelve references are unbound.', { exact: false })).toBeVisible();
  record.artifacts.push(await screenshot(page, 'QA816-ADMIN-F1-manager-people'));
  const context = await page.context().browser()?.newContext({ baseURL: 'http://app.test' });
  if (!context) throw new Error('Reader context unavailable');
  try {
    const reader = await context.newPage();
    await signIn(reader, 'reader');
    const [denied] = await Promise.all([responseAt(reader, path), reader.goto('/#/people')]);
    expect([403, 404]).toContain(denied.status());
    await expect(reader.getByText('Administration unavailable')).toBeVisible();
    await expect(reader.getByText('Current grants loaded', { exact: false })).toHaveCount(0);
    await expect(reader.getByRole('button', { name: 'Save role' })).toHaveCount(0);
    record.artifacts.push(await screenshot(reader, 'QA816-ADMIN-F1-reader-people'));
  } finally { await context.close(); }
  record.assertions.push('Versioned organization grants GET is real and role scoped; unbound planning identities never become reader grant controls');
});
