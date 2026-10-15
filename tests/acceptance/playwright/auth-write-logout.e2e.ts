import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { scenario } from './cases.js';
import { saveInput } from './draft-recovery-support.js';
import { observeDraft } from './observer.js';
import { responseAt, seed, signIn } from './support.js';
import { transportBarrier } from './transport-barrier.js';
import { loadAcceptanceConfig } from '../shared/config.js';

const id = 'SCN-AUTH-003-F1';

// AIDEV-NOTE: Logout cannot undo a committed write; its held acknowledgment must not revive private UI state.
scenario(id, 'committed-draft-acknowledgment-after-real-logout', async (page, record) => {
  const config = loadAcceptanceConfig();
  expect(seed.kind).toBe('runtime');
  expect(seed.fixture_variant).toBe('base');
  expect(seed.fixture_identity).toMatchObject({ case_id: id, engine: page.context().browser()?.browserType().name(),
    attempt: test.info().retry, run_id: config.runId, dispatch_id: config.dispatchId });
  const writes: Request[] = [];
  const observe = (request: Request): void => {
    const url = new URL(request.url());
    if (url.origin === 'http://app.test' && url.pathname.startsWith('/v1/drafts/')
      && request.method() === 'PUT') writes.push(request);
  };
  let barrier: Awaited<ReturnType<typeof transportBarrier>> | undefined;
  page.on('request', observe);
  try {
    await signIn(page, 'composer');
    await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts`);
    await page.getByRole('button', { name: 'New draft', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'New draft', exact: true })).toBeVisible();
    const draftId = /\/drafts\/([0-9a-f-]{36})(?:\?|$)/.exec(new URL(page.url()).hash)?.[1];
    if (!draftId) throw new Error('Draft route missing');
    const subject = `${seed.data.marker} logout race`;
    const body = 'Private literal <b>draft</b> before logout.\n';
    await page.getByLabel('Subject', { exact: true }).fill(subject);
    await page.getByLabel('To', { exact: true }).fill('recipient@acceptance.test');
    await page.getByLabel('Message', { exact: true }).fill(body);
    expect(await observeDraft(draftId, null, 'before')).toEqual({ drafts: [], operations: [] });
    record.evidence.push('Independent SQL before save: no draft or operation row.');
    barrier = await transportBarrier(page, `/v1/drafts/${draftId}`, 'PUT', 'hold-response');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    expect(await barrier.reached).toBe(200);
    expect(writes).toHaveLength(1);
    const raw = writes[0]?.postData();
    if (!raw || Buffer.byteLength(raw) > 1048576) throw new Error('Save input boundary rejected');
    const submitted = saveInput.parse(JSON.parse(raw) as unknown);
    expect(submitted).toEqual({ mailbox_id: seed.mailboxes.primary, operation_id: submitted.operation_id,
      expected_version: 0, subject, to: [{ display_name: null, address: 'recipient@acceptance.test' }],
      body_text: body, reply_to_thread_id: null });
    await page.getByRole('button', { name: 'Account and sign-out' }).click();
    const [logout] = await Promise.all([responseAt(page, '/v1/auth/logout', 'POST'),
      page.getByRole('dialog', { name: 'Account', exact: true })
        .getByRole('button', { name: 'Sign out', exact: true }).click()]);
    expect(logout.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    barrier.release();
    await barrier.close();
    barrier = undefined;
    expect((await page.request.get('/v1/session', { maxRedirects: 0 })).status()).toBe(401);
    expect((await page.request.get(`/v1/drafts/${draftId}`, { maxRedirects: 0 })).status()).toBe(401);
    expect(await observeDraft(draftId, submitted.operation_id, 'after')).toEqual({
      drafts: [{ id: draftId, version: 1, state: 'editable' }],
      operations: [{ operation_id: submitted.operation_id, outcome: 'applied', version: 1 }] });
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByLabel('Subject', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Message', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Saved version 1', { exact: true })).toHaveCount(0);
    await expect(page.locator('a[data-thread], pre')).toHaveCount(0);
    expect(writes).toHaveLength(1);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    expect((await page.request.get('/v1/session', { maxRedirects: 0 })).status()).toBe(401);
    record.assertions.push('Real logout retires a held successful draft response; private editor stays absent and authenticated APIs deny access after release and reload');
    record.evidence.push('One real PUT committed before logout; independent SQL proves one editable version and one applied operation after logout; no claim of write cancellation or database lock ordering');
    await signIn(page, 'composer');
    await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts/${draftId}`);
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(subject);
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(body);
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    expect(writes).toHaveLength(1);
    record.assertions.push('A fresh genuine sign-in can reopen the committed draft without a duplicate write');
  } finally {
    try { await barrier?.close(); }
    finally { page.off('request', observe); await page.close({ runBeforeUnload: false }); }
  }
});
