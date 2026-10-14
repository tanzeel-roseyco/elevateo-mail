import { expect } from '@playwright/test';
import { z } from 'zod';
import { scenario, unavailable } from './cases.js';
import { responseAt, seed, signIn } from './support.js';

const collection = z.strictObject({ context_id: z.string().min(16).max(256),
  authorization_version: z.string().min(16).max(256), next_cursor: z.null(),
  items: z.array(z.strictObject({ id: z.uuid(), display_name: z.string().max(256), display_address: z.string().max(256).nullable(),
    capabilities: z.strictObject({ read: z.literal(true), compose: z.boolean(), approve_send: z.boolean(), manage_members: z.boolean() }) })).max(50) });

// AIDEV-NOTE: The multi-mailbox producer commits two real grants; the excluded and foreign boxes are positive deny controls.
if (seed.fixture_variant === 'multi_mailbox') {
  scenario('SCN-READ-001-P', 'real-multiple-mailboxes-with-different-compose-grants', async (page, record) => {
    const secondary = z.uuid().parse(seed.extra_mailboxes.secondary);
    const excluded = z.uuid().parse(seed.extra_mailboxes.excluded);
    const pending = responseAt(page, '/v1/mailboxes');
    const [response] = await Promise.all([pending, signIn(page, 'composer')]);
    expect(response.status()).toBe(200);
    const bytes = await response.body();
    expect(bytes.length).toBeLessThanOrEqual(262144);
    const result = collection.parse(JSON.parse(bytes.toString('utf8')) as unknown);
    expect(result.items.map(item => item.id).sort()).toEqual([seed.mailboxes.primary, secondary].sort());
    expect(result.items.find(item => item.id === seed.mailboxes.primary)?.capabilities).toEqual({
      read: true, compose: true, approve_send: false, manage_members: false });
    expect(result.items.find(item => item.id === secondary)?.capabilities).toEqual({
      read: true, compose: false, approve_send: false, manage_members: false });
    for (const id of [seed.mailboxes.primary, secondary])
      await expect(page.locator(`a[href="#/mailboxes/${id}"]`)).toBeVisible();
    for (const id of [excluded, seed.mailboxes.other]) {
      await expect(page.locator(`a[href="#/mailboxes/${id}"]`)).toHaveCount(0);
      const denied = responseAt(page, `/v1/mailboxes/${id}/threads`);
      await page.goto(`/#/mailboxes/${id}`);
      expect((await denied).status()).toBe(404);
      await expect(page.getByRole('heading', { name: 'This mailbox is unavailable', exact: true })).toBeVisible();
      await expect(page.locator('a[data-thread], pre')).toHaveCount(0);
    }
    const allowed = responseAt(page, `/v1/mailboxes/${secondary}/threads`);
    await page.goto(`/#/mailboxes/${secondary}`);
    expect((await allowed).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'No conversations', exact: true })).toBeVisible();
    await expect(page.locator(`a[href="#/mailboxes/${secondary}/drafts"]`)).toHaveCount(0);
    const forbiddenDrafts = responseAt(page, '/v1/drafts');
    await page.goto(`/#/mailboxes/${secondary}/drafts`);
    expect((await forbiddenDrafts).status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Composing is not available in this mailbox', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New draft', exact: true })).toHaveCount(0);
    record.assertions.push('Genuine collection contains exactly primary compose and secondary read-only; excluded and cross-tenant deep links are denied without content');
    record.evidence.push('Real Auth composer and real API200/404; complete fixture membership verified before publication, no fabricated mailbox payload');
  });
} else {
  unavailable('SCN-READ-001-P', 'Requires fresh multi_mailbox variant; current dataset supplies a different real fixture');
}
