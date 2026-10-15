import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { receiptJson, saveInput } from './draft-recovery-support.js';
import { observeDraft } from './observer.js';
import { responseAt, seed, signIn } from './support.js';
import { transportBarrier } from './transport-barrier.js';
import { loadAcceptanceConfig } from '../shared/config.js';

const id = 'SCN-DRAFT-003-F2';
const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const conflictReceipt = z.strictObject({ context_id: token, authorization_version: token,
  operation: z.strictObject({ operation_id: z.uuid(), mailbox_id: z.uuid(), draft_id: z.uuid(),
    outcome: z.literal('conflict'), code: z.literal('draft_conflict'), expected_version: z.literal(1),
    current_version: z.literal(2), state: z.literal('editable'),
    recorded_at: z.iso.datetime(), detail_expires_at: z.iso.datetime() }) });
const input = (request: Request | undefined): z.infer<typeof saveInput> => {
  const raw = request?.postData();
  if (!raw || Buffer.byteLength(raw) > 1048576) throw new Error('Save input boundary rejected');
  return saveInput.parse(JSON.parse(raw) as unknown);
};

// AIDEV-NOTE: A real second-client write forces conflict; only the stale PUT's genuine 409 acknowledgement is lost.
scenario(id, 'recorded-conflict-lookup-preserves-text-and-explicit-rebase', async (page, record) => {
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
    const subject = page.getByLabel('Subject', { exact: true });
    const to = page.getByLabel('To', { exact: true });
    const body = page.getByLabel('Message', { exact: true });
    await subject.fill(`${seed.data.marker} original`);
    await to.fill('recipient@acceptance.test');
    await body.fill('Original draft');
    const [saved] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`, 'PUT'),
      page.getByRole('button', { name: 'Save draft', exact: true }).click()]);
    const original = input(saved.request());
    expect(await receiptJson(saved)).toEqual({ draft_id: draftId, operation_id: original.operation_id,
      version: 1, state: 'editable' });
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    const headers = { Origin: 'http://app.test',
      'X-Session-Context': token.parse(await saved.request().headerValue('X-Session-Context')),
      'X-Authorization-Version': token.parse(await saved.request().headerValue('X-Authorization-Version')),
      'X-CSRF-Token': token.parse(await saved.request().headerValue('X-CSRF-Token')) };
    const winningId = randomUUID();
    const winning = await page.request.put(`/v1/drafts/${draftId}`, { headers, maxRedirects: 0,
      data: { ...original, operation_id: winningId, expected_version: 1, subject: `${seed.data.marker} winner` } });
    expect(await receiptJson(winning)).toEqual({ draft_id: draftId, operation_id: winningId,
      version: 2, state: 'editable' });
    expect(await observeDraft(draftId, winningId, 'before')).toEqual({
      drafts: [{ id: draftId, version: 2, state: 'editable' }],
      operations: [{ operation_id: winningId, outcome: 'applied', version: 2 }] });
    await subject.fill(`${seed.data.marker} stale`);
    barrier = await transportBarrier(page, `/v1/drafts/${draftId}`, 'PUT', 'lose-ack');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    expect(await barrier.reached).toBe(409);
    await barrier.close();
    barrier = undefined;
    expect(writes).toHaveLength(2);
    const stale = input(writes[1]);
    expect(stale.expected_version).toBe(1);
    const conflictState = { drafts: [{ id: draftId, version: 2, state: 'editable' }],
      operations: [{ operation_id: stale.operation_id, outcome: 'conflict', version: 2 }] };
    expect(await observeDraft(draftId, stale.operation_id, 'after')).toEqual(conflictState);
    const check = page.getByRole('button', { name: 'Check what the server stored', exact: true });
    await expect(check).toBeVisible();
    const newer = { subject: `  ${seed.data.marker} newer  `,
      to: '  New Name <newer@acceptance.test>  \nsecond@acceptance.test\n',
      body: '\nNewer literal <script>text</script> & whitespace.\n\n' };
    await subject.fill(newer.subject);
    await to.fill(newer.to);
    await body.fill(newer.body);
    const [lookup] = await Promise.all([responseAt(page, `/v1/draft-operations/${stale.operation_id}`), check.click()]);
    const receipt = conflictReceipt.parse(await receiptJson(lookup));
    expect(receipt.operation).toMatchObject({ operation_id: stale.operation_id,
      mailbox_id: seed.mailboxes.primary, draft_id: draftId });
    const lookupUrl = new URL(lookup.url());
    expect(lookupUrl.searchParams.get('mailbox_id')).toBe(seed.mailboxes.primary);
    expect(lookupUrl.searchParams.get('draft_id')).toBe(draftId);
    await expect(page.getByText('This draft changed elsewhere (now version 2). Your text was not saved and nothing was overwritten.', { exact: true })).toBeVisible();
    for (const [field, value] of [[subject, newer.subject], [to, newer.to], [body, newer.body]] as const) {
      await expect(field).toHaveValue(value);
      await expect(field).toBeDisabled();
    }
    await expect(page.getByRole('button', { name: 'Retry this save', exact: true })).toHaveCount(0);
    expect(writes).toHaveLength(2);
    expect(await observeDraft(draftId, stale.operation_id, 'after')).toEqual(conflictState);
    await page.getByRole('button', { name: 'Keep my text and continue from the server version', exact: true }).click();
    await expect(subject).toBeEnabled();
    await expect(subject).toHaveValue(newer.subject);
    await expect(to).toHaveValue(newer.to);
    await expect(body).toHaveValue(newer.body);
    const [rebased] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`, 'PUT'),
      page.getByRole('button', { name: 'Save changes', exact: true }).click()]);
    const next = input(rebased.request());
    expect(next.operation_id).not.toBe(stale.operation_id);
    expect(next.expected_version).toBe(2);
    expect(next.subject).toBe(newer.subject);
    expect(next.body_text).toBe(newer.body);
    expect(next.to).toEqual([{ display_name: 'New Name', address: 'newer@acceptance.test' },
      { display_name: null, address: 'second@acceptance.test' }]);
    expect(await receiptJson(rebased)).toEqual({ draft_id: draftId, operation_id: next.operation_id,
      version: 3, state: 'editable' });
    expect(await observeDraft(draftId, next.operation_id, 'after')).toEqual({
      drafts: [{ id: draftId, version: 3, state: 'editable' }],
      operations: [{ operation_id: next.operation_id, outcome: 'applied', version: 3 }] });
    expect((await observeDraft(draftId, stale.operation_id, 'after')).operations).toEqual(conflictState.operations);
    await page.reload();
    await expect(subject).toHaveValue(newer.subject);
    await expect(body).toHaveValue(newer.body);
    await expect(to).toHaveValue('New Name <newer@acceptance.test>\nsecond@acceptance.test');
    await expect(page.getByText('Saved version 3', { exact: true })).toBeVisible();
    await page.close({ runBeforeUnload: false });
    expect(writes).toHaveLength(3);
    record.assertions.push('Real lost conflict acknowledgement resolves through a bound recorded-conflict lookup without overwrite or discarded input; explicit rebase commits once at version 3');
    record.evidence.push('Scoped SQL witnesses confirm winning/applied and stale/conflict operations; genuine authenticated PUT/GET receipts and reload; no private payload export');
  } finally {
    try { await barrier?.close(); }
    finally { page.off('request', observe); await page.close({ runBeforeUnload: false }); }
  }
});
