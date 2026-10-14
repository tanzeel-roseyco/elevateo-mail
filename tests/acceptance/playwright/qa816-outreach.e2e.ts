import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { responseAt, screenshot, signIn } from './support.js';

// AIDEV-NOTE: The case owns one disposable draft campaign; no send or enrollment route is invoked.
scenario('SCN-QA-820-P', 'real-auth-outreach-draft-create-list-detail', async (page, record) => {
  await signIn(page, 'manager_primary');
  const [initial] = await Promise.all([responseAt(page, '/v2/outreach/campaigns'), page.goto('/#/outreach/campaigns')]);
  expect(initial.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Campaigns', exact: true })).toBeVisible();
  await expect(page.getByText('Outreach is draft or paused. Sending and enrollment are unavailable.')).toBeVisible();
  await page.getByRole('link', { name: 'Create draft campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Create campaign' })).toBeVisible();
  const name = `QA816 correspondence planning ${randomUUID()}`;
  await page.getByLabel('Campaign name').fill(name);
  const [created] = await Promise.all([responseAt(page, '/v2/outreach/campaigns', 'POST'), page.getByRole('button', { name: 'Save draft' }).click()]);
  expect(created.ok()).toBe(true);
  const campaignId = /\/outreach\/campaigns\/([0-9a-f-]{36})/.exec(new URL(page.url()).hash)?.[1];
  if (!campaignId) throw new Error('Campaign detail route missing');
  await expect(page.getByRole('heading', { name: 'Campaign detail' })).toBeVisible();
  await expect(page.getByText(name, { exact: false })).toBeVisible();
  await expect(page.getByText('draft', { exact: false })).toBeVisible();
  record.artifacts.push(await screenshot(page, 'QA816-OUTREACH-P-detail'));
  const [detail] = await Promise.all([responseAt(page, `/v2/outreach/campaigns/${campaignId}`), page.reload()]);
  expect(detail.status()).toBe(200);
  await expect(page.getByText(name, { exact: false })).toBeVisible();
  const [listed] = await Promise.all([responseAt(page, '/v2/outreach/campaigns'), page.goto('/#/outreach/campaigns')]);
  expect(listed.status()).toBe(200);
  await expect(page.getByRole('link', { name })).toBeVisible();
  record.artifacts.push(await screenshot(page, 'QA816-OUTREACH-P-list'));
  record.assertions.push('Real-auth V2 campaign draft create, detail reload and list round trip preserve case-owned name without send/enrollment');
  record.evidence.push('Observed V2 campaign GET 200, POST 2xx, detail GET 200, list GET 200; no payload retained');
});

scenario('SCN-QA-820-F1', 'invalid-campaign-name-does-not-post', async (page, record) => {
  await signIn(page, 'manager_primary');
  await page.goto('/#/outreach/campaigns/new');
  await expect(page.getByRole('heading', { name: 'Create campaign' })).toBeVisible();
  let writes = 0;
  const count = (request: { url(): string; method(): string }): void => {
    if (new URL(request.url()).pathname === '/v2/outreach/campaigns' && request.method() === 'POST') writes += 1;
  };
  page.on('request', count);
  try {
    await page.getByLabel('Campaign name').fill('');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('heading', { name: 'Create campaign' })).toBeVisible();
    expect(writes).toBe(0);
    record.artifacts.push(await screenshot(page, 'QA816-OUTREACH-F1-invalid-name'));
  } finally { page.off('request', count); }
  record.assertions.push('Empty campaign name is rejected by the real browser form before any V2 POST');
});

scenario('SCN-QA-820-F2', 'foreign-organization-cannot-read-campaign', async (page, record) => {
  await signIn(page, 'manager_primary');
  await page.goto('/#/outreach/campaigns/new');
  const name = `QA816 foreign ${randomUUID()}`;
  await page.getByLabel('Campaign name').fill(name);
  const [created] = await Promise.all([responseAt(page, '/v2/outreach/campaigns', 'POST'), page.getByRole('button', { name: 'Save draft' }).click()]);
  expect(created.status()).toBe(201);
  const campaignId = /\/outreach\/campaigns\/([0-9a-f-]{36})/.exec(new URL(page.url()).hash)?.[1];
  if (!campaignId) throw new Error('Campaign detail route missing');
  const context = await page.context().browser()?.newContext({ baseURL: 'http://app.test' });
  if (!context) throw new Error('Foreign context unavailable');
  try {
    const foreign = await context.newPage();
    await signIn(foreign, 'other_org');
    const [denied] = await Promise.all([responseAt(foreign, `/v2/outreach/campaigns/${campaignId}`),
      foreign.goto(`/#/outreach/campaigns/${campaignId}`)]);
    expect(denied.status()).toBe(404);
    await expect(foreign.getByRole('alert').getByText('Unable to load this Outreach resource. Please try again later.')).toBeVisible();
    await expect(foreign.getByText(name, { exact: true })).toHaveCount(0);
    record.artifacts.push(await screenshot(foreign, 'QA816-OUTREACH-F2-foreign-denied'));
  } finally { await context.close(); }
  record.assertions.push('Separate other-organization browser session receives real V2 404 and no case-owned campaign detail');
});

scenario('SCN-QA-821-P', 'logout-revokes-outreach-and-people-cache', async (page, record) => {
  await signIn(page, 'manager_primary');
  const [campaigns] = await Promise.all([responseAt(page, '/v2/outreach/campaigns'), page.goto('/#/outreach/campaigns')]);
  expect(campaigns.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Campaigns', exact: true })).toBeVisible();
  await page.goto('/#/people');
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Account and sign-out' }).click();
  const [logout] = await Promise.all([responseAt(page, '/v1/auth/logout', 'POST'),
    page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click()]);
  expect(logout.ok()).toBe(true);
  for (const hash of ['/#/outreach/campaigns', '/#/people']) {
    await page.goto(hash);
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Campaigns', exact: true })).toHaveCount(0);
    await expect(page.getByText('Current grants loaded', { exact: false })).toHaveCount(0);
  }
  expect((await page.request.get('/v1/session', { maxRedirects: 0 })).status()).toBe(401);
  record.assertions.push('Logout after actual V2 campaign read clears protected Outreach and People routes and leaves real V1 session denied');
});
