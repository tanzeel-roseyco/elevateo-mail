import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { responseAt } from './support.js';
import { atCompletion, fillInvitationPassword, loadInvitation } from './invitation.js';

const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const text = z.string().refine(value => Array.from(value).length <= 256);
// AIDEV-NOTE: Mirror the actual session wire contract; compare private identity only as boolean predicates.
const session = z.strictObject({ context_id: token, authorization_version: token, csrf_token: token,
  simulation_mode: z.literal(true), actor: z.strictObject({ id: z.uuid(), display_name: text.nullable() }),
  organization: z.strictObject({ id: z.uuid(), name: text }) });
async function follow(page: Page, link: string): Promise<void> {
  try { await page.goto(link); }
  catch { throw new Error('Invitation navigation failed'); }
  await expect.poll(() => atCompletion(page.url())).toBe(true);
}
async function denied(page: Page): Promise<void> {
  expect((await page.request.get('/v1/session', { maxRedirects: 0 })).status()).toBe(401);
  await expect(page.locator('a[data-thread]')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Conversations', exact: true })).toHaveCount(0);
}
scenario('SCN-AUTH-006-P', 'genuine-invitation-scanner-victim-replay', async (page, record) => {
  const invitation = loadInvitation();
  // AIDEV-NOTE: Fresh contexts need the validated invitation origin for their relative session requests.
  const baseURL = new URL(invitation.link).origin;
  const browser = page.context().browser();
  if (!browser) throw new Error('Invitation browser unavailable');
  const contexts: BrowserContext[] = [];
  try {
    const scanner = await browser.newContext({ baseURL });
    contexts.push(scanner);
    const scanned = await scanner.newPage();
    await follow(scanned, invitation.link);
    // AIDEV-NOTE: Scanner stages GET only; the later successful victim proves scanner nonconsumption.
    await denied(scanned);
    await scanner.close();
    const victim = await browser.newContext({ baseURL });
    contexts.push(victim);
    const accepted = await victim.newPage();
    await follow(accepted, invitation.link);
    await expect(accepted.getByRole('heading', { name: 'Set your password', exact: true })).toBeVisible();
    await denied(accepted);
    await fillInvitationPassword(accepted, invitation.password);
    const [receipt] = await Promise.all([responseAt(accepted, '/v1/auth/accept', 'POST'),
      accepted.getByRole('button', { name: 'Set password and sign in', exact: true }).click()]);
    expect(receipt.status()).toBe(200);
    await expect(accepted.getByRole('heading', { name: 'Access is set up', exact: true })).toBeVisible();
    await accepted.getByRole('link', { name: 'Open Elevateo Mail', exact: true }).click();
    const response = await accepted.request.get('/v1/session', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const parsed = session.safeParse(await response.json() as unknown);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('Invitation session contract rejected');
    expect(parsed.data.actor.id === invitation.actor_id).toBe(true);
    expect(parsed.data.organization.id === invitation.organization_id).toBe(true);
    await expect(accepted.locator(`a[href="#/mailboxes/${invitation.mailbox_id}"]`)).toBeVisible();
    await accepted.locator(`a[href="#/mailboxes/${invitation.mailbox_id}"]`).click();
    await expect(accepted.getByRole('region', { name: 'Conversations', exact: true })).toBeVisible();
    record.assertions.push('Scanner GET did not consume invitation; genuine UI acceptance bound actor and organization and rendered mailbox');
    record.evidence.push('Observed POST /v1/auth/accept 200 and GET /v1/session 401 before acceptance, 200 afterward');
    const replay = await browser.newContext({ baseURL });
    contexts.push(replay);
    const rejected = await replay.newPage();
    await follow(rejected, invitation.link);
    if (await rejected.getByRole('heading', { name: 'Set your password', exact: true }).isVisible()) {
      await fillInvitationPassword(rejected, invitation.password);
      const [failure] = await Promise.all([responseAt(rejected, '/v1/auth/accept', 'POST'),
        rejected.getByRole('button', { name: 'Set password and sign in', exact: true }).click()]);
      expect(failure.status()).toBe(401);
    }
    await expect(rejected.getByRole('heading', { name: 'This link cannot be used', exact: true })).toBeVisible();
    await denied(rejected);
    record.assertions.push('Consumed invitation rejected in isolated replay context with session 401 and no protected contents');
  } finally {
    // AIDEV-NOTE: Attempt every owned context close even when an earlier close fails; never publish raw errors.
    const closed = await Promise.allSettled(contexts.map(context => context.close()));
    if (closed.some(result => result.status === 'rejected')) throw new Error('Invitation context cleanup failed');
  }
});
