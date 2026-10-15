import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { receiptJson, saveInput } from './draft-recovery-support.js';
import { observeDraft } from './observer.js';
import { responseAt, seed, signIn } from './support.js';
import { transportBarrier } from './transport-barrier.js';
import { loadAcceptanceConfig } from '../shared/config.js';

const id = 'SCN-DRAFT-003-F1';
const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const unknownReceipt = z.strictObject({ context_id: token, authorization_version: token,
  operation: z.strictObject({ operation_id: z.uuid(), mailbox_id: z.uuid(), draft_id: z.uuid(),
    outcome: z.literal('unknown') }) });
const savedReceipt = z.strictObject({ draft_id: z.uuid(), operation_id: z.uuid(),
  version: z.number().int().min(1).max(2147483647), state: z.literal('editable') });

// AIDEV-NOTE: An absent receipt alone proves nothing; independent scoped SQL witnesses bracket the original-ID retry.
scenario(id, 'unforwarded-save-unknown-lookup-exact-retry-newer-buffer', async (page, record) => {
  const config = loadAcceptanceConfig();
  expect(seed.kind).toBe('runtime');
  expect(seed.fixture_variant).toBe('base');
  expect(seed.fixture_identity).toMatchObject({ case_id: id, engine: page.context().browser()?.browserType().name(),
    attempt: test.info().retry, run_id: config.runId, dispatch_id: config.dispatchId });
  const writes: Request[] = [];
  const lookups: URL[] = [];
  const observe = (request: Request): void => {
    const url = new URL(request.url());
    if (url.origin !== 'http://app.test') return;
    if (request.method() === 'PUT' && url.pathname.startsWith('/v1/drafts/')) writes.push(request);
    if (request.method() === 'GET' && url.pathname.startsWith('/v1/draft-operations/')) lookups.push(url);
  };
  const input = (request: Request | undefined): z.infer<typeof saveInput> => {
    const raw = request?.postData();
    if (!raw || Buffer.byteLength(raw) > 1048576) throw new Error('Save input boundary rejected');
    return saveInput.parse(JSON.parse(raw) as unknown);
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
    const original = { subject: `${seed.data.marker} original`, to: 'Original <original@acceptance.test>',
      body: 'Original literal <b>buffer</b>\n' };
    await subject.fill(original.subject);
    await to.fill(original.to);
    await body.fill(original.body);
    expect(await observeDraft(draftId, null, 'before')).toEqual({ drafts: [], operations: [] });
    record.evidence.push('Independent SQL before dropped save: no draft or operation row.');
    barrier = await transportBarrier(page, `/v1/drafts/${draftId}`, 'PUT', 'no-forward');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    expect(await barrier.reached).toBeNull();
    await barrier.close();
    barrier = undefined;
    expect(writes).toHaveLength(1);
    const submitted = input(writes[0]);
    expect(submitted).toEqual({ mailbox_id: seed.mailboxes.primary, operation_id: submitted.operation_id,
      expected_version: 0, subject: original.subject,
      to: [{ display_name: 'Original', address: 'original@acceptance.test' }],
      body_text: original.body, reply_to_thread_id: null });
    const check = page.getByRole('button', { name: 'Check what the server stored', exact: true });
    const retry = page.getByRole('button', { name: 'Retry this save', exact: true });
    await expect(check).toBeVisible();
    await expect(page.getByText('Not saved yet', { exact: true })).toBeVisible();
    const newer = { subject: `  ${seed.data.marker} newer  `,
      to: '  New Name <newer@acceptance.test>  \nsecond@acceptance.test\n',
      body: '\nNewer literal <script>text</script> & whitespace.\n\n' };
    await subject.fill(newer.subject);
    await to.fill(newer.to);
    await body.fill(newer.body);
    const [lookup] = await Promise.all([responseAt(page, `/v1/draft-operations/${submitted.operation_id}`),
      check.click()]);
    const unknown = unknownReceipt.parse(await receiptJson(lookup));
    expect(unknown.operation).toEqual({ operation_id: submitted.operation_id, draft_id: draftId,
      mailbox_id: submitted.mailbox_id, outcome: 'unknown' });
    await expect(page.getByText('No record of this save is visible yet. It may still be in progress; it is not proof that nothing was stored. Retry the same save or check again.', { exact: true })).toBeVisible();
    await expect(page.getByText('Not saved yet', { exact: true })).toBeVisible();
    await expect(retry).toBeEnabled();
    await expect(subject).toHaveValue(newer.subject);
    await expect(to).toHaveValue(newer.to);
    await expect(body).toHaveValue(newer.body);
    expect(await observeDraft(draftId, submitted.operation_id, 'after')).toEqual({ drafts: [], operations: [] });
    record.evidence.push('Independent SQL after unknown lookup: no draft or operation row.');
    const [saved] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`, 'PUT'), retry.click()]);
    expect(input(saved.request())).toEqual(submitted);
    expect(savedReceipt.parse(await receiptJson(saved))).toEqual({ draft_id: draftId,
      operation_id: submitted.operation_id, version: 1, state: 'editable' });
    expect(await observeDraft(draftId, submitted.operation_id, 'after')).toEqual({
      drafts: [{ id: draftId, version: 1, state: 'editable' }],
      operations: [{ operation_id: submitted.operation_id, outcome: 'applied', version: 1 }] });
    record.evidence.push('Independent SQL after original retry: one editable draft version and one applied operation.');
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    await expect(subject).toHaveValue(newer.subject);
    await expect(to).toHaveValue(newer.to);
    await expect(body).toHaveValue(newer.body);
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await expect(check).toHaveCount(0);
    await expect(retry).toHaveCount(0);
    expect(writes.map(request => new URL(request.url()).pathname)).toEqual([
      `/v1/drafts/${draftId}`, `/v1/drafts/${draftId}`]);
    expect(input(writes[1])).toEqual(submitted);
    expect(lookups).toHaveLength(1);
    expect(lookups[0]?.pathname).toBe(`/v1/draft-operations/${submitted.operation_id}`);
    expect(lookups[0]?.searchParams.get('draft_id')).toBe(draftId);
    expect(lookups[0]?.searchParams.get('mailbox_id')).toBe(seed.mailboxes.primary);
    record.assertions.push('Unforwarded save and real unknown lookup preserve uncertainty; exact original retry commits once while newer raw input remains unsaved');
    record.evidence.push('Three independent scoped SQL snapshots with positive sentinel; real bound GET/PUT receipts; two PUT attempts, one forwarded; no private payload export');
  } finally {
    try { await barrier?.close(); }
    finally { page.off('request', observe); await page.close({ runBeforeUnload: false }); }
  }
});
