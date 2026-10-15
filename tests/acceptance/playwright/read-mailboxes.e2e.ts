import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { responseAt, seed, signIn } from './support.js';
import { loadAcceptanceConfig } from '../shared/config.js';

const id = 'SCN-READ-001-P';
const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const mailboxPage = z.strictObject({ context_id: token, authorization_version: token, next_cursor: z.null(),
  items: z.array(z.strictObject({ id: z.uuid(), display_name: z.string().max(256),
    display_address: z.string().max(256).nullable(), capabilities: z.strictObject({ read: z.literal(true),
      compose: z.boolean(), approve_send: z.boolean(), manage_members: z.boolean() }) })).length(2) });

// AIDEV-NOTE: The committed multi-mailbox fixture varies capabilities and excludes an ungranted private mailbox.
scenario(id, 'two-authorized-mailboxes-with-distinct-capabilities', async (page, record) => {
  const config = loadAcceptanceConfig();
  expect(seed.kind).toBe('runtime');
  expect(seed.fixture_variant).toBe('multi_mailbox');
  expect(seed.fixture_identity).toMatchObject({ case_id: id, engine: page.context().browser()?.browserType().name(),
    attempt: test.info().retry, run_id: config.runId, dispatch_id: config.dispatchId });
  const { secondary, excluded } = seed.extra_mailboxes;
  if (!secondary || !excluded) throw new Error('Multi-mailbox fixture required');
  await page.setViewportSize({ width: 1280, height: 900 });
  const [response] = await Promise.all([responseAt(page, '/v1/mailboxes'), signIn(page, 'composer')]);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']?.includes('application/json')).toBe(true);
  const bytes = await response.body();
  expect(bytes.length).toBeLessThanOrEqual(131072);
  const parsed = mailboxPage.safeParse(JSON.parse(bytes.toString('utf8')) as unknown);
  if (!parsed.success) throw new Error('Mailbox response boundary rejected');
  const actual = parsed.data.items.map(box => ({ mailbox_id: box.id,
    capabilities: Object.entries(box.capabilities).filter(([, enabled]) => enabled)
      .map(([name]) => name === 'manage_members' ? 'manage' : name).sort() }))
    .sort((a, b) => a.mailbox_id.localeCompare(b.mailbox_id));
  const expected = seed.expected_mailbox_memberships.composer.map(row => ({ mailbox_id: row.mailbox_id,
    capabilities: [...row.capabilities].sort() })).sort((a, b) => a.mailbox_id.localeCompare(b.mailbox_id));
  expect(actual).toEqual(expected);
  for (const box of parsed.data.items) {
    await expect(page.getByRole('link', { name: box.display_name, exact: true }))
      .toHaveAttribute('href', `#/mailboxes/${box.id}`);
  }
  for (const hidden of [excluded, seed.mailboxes.other]) {
    await expect(page.locator(`a[href^="#/mailboxes/${hidden}"]`)).toHaveCount(0);
    expect((await page.request.get(`/v1/mailboxes/${hidden}/threads`, { maxRedirects: 0 })).status()).toBe(404);
  }
  record.assertions.push('Real mailbox API and navigation expose exactly two authorized mailboxes with exact capability sets; ungranted private and foreign mailbox reads return 404');
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}`);
  await expect(page.getByRole('link', { name: 'Drafts', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Drafts', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New draft', exact: true })).toBeVisible();
  const [threads] = await Promise.all([responseAt(page, `/v1/mailboxes/${secondary}/threads`),
    page.goto(`/#/mailboxes/${secondary}`)]);
  expect(threads.status()).toBe(200);
  await expect(page.getByRole('region', { name: 'Conversations', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Drafts', exact: true })).toHaveCount(0);
  await page.goto(`/#/mailboxes/${secondary}/drafts`);
  await expect(page.getByRole('heading', { name: 'Composing is not available in this mailbox', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New draft', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Composing is not available in this mailbox', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New draft', exact: true })).toHaveCount(0);
  record.assertions.push('Compose mailbox exposes drafts; read-only mailbox supports conversation reads and refuses composing after direct navigation and reload');
  record.evidence.push('Fresh multi_mailbox seed verifies committed rows and membership sets through an independent read-only database snapshot; no pagination claim');
});
