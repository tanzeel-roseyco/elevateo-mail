import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page, Request, Response } from '@playwright/test';
import { z } from 'zod';
import { draftReceipt } from './boundaries.js';
import { scenario } from './cases.js';
import { responseAt, seed, signIn } from './support.js';
import { loadAcceptanceConfig } from '../shared/config.js';

const id = 'SCN-DRAFT-001-F1';
const address = z.strictObject({ display_name: z.string().max(256).nullable(), address: z.string().max(256).nullable() });
const version = z.number().int().min(0).max(2147483647);
const content = { subject: z.string().max(998), to: z.array(address).max(100),
  body_text: z.string().max(65536), reply_to_thread_id: z.null() };
const saveInput = z.strictObject({ ...content, mailbox_id: z.uuid(), operation_id: z.uuid(), expected_version: version });
const detailSchema = z.strictObject({ context_id: z.string().min(1).max(256),
  authorization_version: z.string().min(1).max(256), draft: z.strictObject({ ...content,
    id: z.uuid(), mailbox_id: z.uuid(), version, state: z.literal('editable'),
    created_at: z.iso.datetime(), updated_at: z.iso.datetime() }) });
const conflictSchema = z.strictObject({ code: z.literal('draft_conflict'),
  message: z.string().max(256), request_id: z.string().min(1).max(128) });

async function json(response: Response, limit = 262144): Promise<unknown> {
  expect(response.headers()['content-type']?.includes('application/json')).toBe(true);
  const bytes = await response.body();
  expect(bytes.length).toBeLessThanOrEqual(limit);
  return JSON.parse(bytes.toString('utf8')) as unknown;
}
async function fill(page: Page, text: { subject: string; to: string; body: string }): Promise<void> {
  await page.getByLabel('To', { exact: true }).fill(text.to);
  await page.getByLabel('Subject', { exact: true }).fill(text.subject);
  await page.getByLabel('Message', { exact: true }).fill(text.body);
}
async function retained(page: Page, text: { subject: string; to: string; body: string }): Promise<void> {
  await expect(page.getByLabel('To', { exact: true })).toHaveValue(text.to);
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(text.subject);
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(text.body);
}
async function load(page: Page, draftId: string) {
  await page.goto('about:blank'); // AIDEV-NOTE: Fresh document forces a genuine GET; context auth cookies persist.
  const [response] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`),
    page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts/${draftId}`)]);
  expect(response.status()).toBe(200);
  const detail = detailSchema.parse(await json(response));
  expect(detail.draft).toMatchObject({ id: draftId, mailbox_id: seed.mailboxes.primary });
  await expect(page.getByText(`Saved version ${detail.draft.version}`, { exact: true })).toBeVisible();
  return { detail, response };
}
// AIDEV-NOTE: Require a case-owned disposable dataset; no delete route exists and no shared seed may be mutated.
scenario(id, 'same-composer-distinct-session-stale-version-save', async (winner, record) => {
  const config = loadAcceptanceConfig();
  expect(seed.kind).toBe('runtime');
  expect(seed.fixture_identity).toMatchObject({ case_id: id, engine: winner.context().browser()?.browserType().name(),
    attempt: test.info().retry, run_id: config.runId, dispatch_id: config.dispatchId });
  const browser = winner.context().browser();
  if (!browser) throw new Error('Browser unavailable');
  const staleContext = await browser.newContext({ baseURL: 'http://app.test' });
  const writes: Request[] = [];
  let path = '';
  const countWrite = (request: Request): void => {
    const url = new URL(request.url());
    if (url.origin === 'http://app.test' && url.pathname === path && request.method() === 'PUT') writes.push(request);
  };
  try {
    const stale = await staleContext.newPage();
    await signIn(winner, 'composer');
    await signIn(stale, 'composer');
    const cookieA = (await winner.context().cookies('http://app.test')).find(cookie => cookie.name === 'elevateo_session');
    const cookieB = (await staleContext.cookies('http://app.test')).find(cookie => cookie.name === 'elevateo_session');
    expect(cookieA?.value).toBeTruthy();
    expect(cookieB?.value).toBeTruthy();
    expect(cookieA?.value === cookieB?.value).toBe(false); // Never export cookie values into evidence.
    const marker = `${id} ${randomUUID()}`;
    const initial = { subject: `${marker} initial`, to: 'initial@acceptance.test', body: `${marker}\nversion one\n` };
    await winner.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts`);
    await winner.getByRole('button', { name: 'New draft', exact: true }).click();
    await fill(winner, initial);
    const draftId = /\/drafts\/([0-9a-f-]{36})(?:\?|$)/.exec(new URL(winner.url()).hash)?.[1];
    if (!draftId) throw new Error('Draft route missing');
    path = `/v1/drafts/${draftId}`;
    const [created] = await Promise.all([responseAt(winner, path, 'PUT'),
      winner.getByRole('button', { name: 'Save draft', exact: true }).click()]);
    expect(created.status()).toBe(200);
    expect(saveInput.parse(created.request().postDataJSON() as unknown).expected_version).toBe(0);
    expect(draftReceipt(await json(created))).toEqual({ draft_id: draftId, version: 1 });
    await expect(winner.getByText('Saved version 1', { exact: true })).toBeVisible();
    // AIDEV-NOTE: Both GET acknowledgements precede the winning PUT; timing sleeps cannot establish this order.
    const first = await load(winner, draftId);
    const second = await load(stale, draftId);
    expect(first.detail.draft).toEqual(second.detail.draft);
    expect(first.detail.draft.version).toBe(1);
    await retained(winner, initial);
    await retained(stale, initial);
    const winning = { subject: `${marker} winner`, to: 'winner@acceptance.test', body: `${marker}\nwinning <b>literal</b> & text\n` };
    const losing = { subject: `  ${marker} stale  `, to: '  Stale Name <stale@acceptance.test>  \n\n  unfinished recipient  \n',
      body: `  ${marker}\nunsaved <i>literal</i> & text\n\n` };
    await fill(stale, losing);
    await fill(winner, winning);
    const [saved] = await Promise.all([responseAt(winner, path, 'PUT'),
      winner.getByRole('button', { name: 'Save changes', exact: true }).click()]);
    expect(saved.status()).toBe(200);
    const winningInput = saveInput.parse(saved.request().postDataJSON() as unknown);
    expect(winningInput.expected_version).toBe(1);
    expect(draftReceipt(await json(saved))).toEqual({ draft_id: draftId, version: 2 });
    await expect(winner.getByText('Saved version 2', { exact: true })).toBeVisible();
    await retained(stale, losing);
    staleContext.on('request', countWrite);
    winner.context().on('request', countWrite);
    const [rejected] = await Promise.all([responseAt(stale, path, 'PUT'),
      stale.getByRole('button', { name: 'Save changes', exact: true }).click()]);
    expect(rejected.status()).toBe(409);
    const staleInput = saveInput.parse(rejected.request().postDataJSON() as unknown);
    expect(staleInput).toMatchObject({ mailbox_id: seed.mailboxes.primary, expected_version: 1,
      subject: losing.subject, body_text: losing.body, reply_to_thread_id: null,
      to: [{ display_name: 'Stale Name', address: 'stale@acceptance.test' },
        { display_name: 'unfinished recipient', address: null }] });
    expect(staleInput.operation_id).not.toBe(winningInput.operation_id);
    conflictSchema.parse(await json(rejected, 4096));
    const alert = stale.getByRole('alert');
    await expect(alert.locator('span').first()).toHaveText(
      'This draft changed elsewhere. Your text was not saved and nothing was overwritten.');
    await expect(alert.getByRole('button', { name: 'Keep my text and continue from the server version', exact: true })).toBeEnabled();
    await expect(alert.getByRole('button', { name: 'Discard my text and load the server copy', exact: true })).toBeEnabled();
    await expect(stale.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    for (const label of ['To', 'Subject', 'Message']) await expect(stale.getByLabel(label, { exact: true })).toBeDisabled();
    await retained(stale, losing);
    const after = await load(winner, draftId);
    expect(after.detail.draft).toMatchObject({ version: 2, subject: winning.subject, body_text: winning.body,
      to: [{ display_name: null, address: winning.to }], reply_to_thread_id: null });
    // AIDEV-NOTE: Close the stale context after stable conflict assertions, ending its possible trailing-write lifetime.
    await retained(stale, losing);
    await staleContext.close();
    expect(writes.length).toBe(1);
    const final = await load(winner, draftId);
    expect(final.detail.draft).toEqual(after.detail.draft);
    expect(writes.length).toBe(1);
    record.assertions.push('Distinct sessions of one composer loaded v1; acknowledged v2 precedes real stale-v1 409; raw edits retained');
    record.assertions.push('Conflict disables save/edit; authenticated GETs retain exact winner v2; one losing PUT through context close');
    record.evidence.push('Case-owned draft and disposable dataset; HTTP bodies/cookies remain private; observer OFF; no sleeps or mocks');
  } finally {
    staleContext.off('request', countWrite);
    winner.context().off('request', countWrite);
    await staleContext.close();
  }
});
