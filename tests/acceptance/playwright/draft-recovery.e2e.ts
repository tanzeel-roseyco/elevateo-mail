import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { scenario } from './cases.js';
import { appliedReceipt, loseCommittedSave, receiptJson } from './draft-recovery-support.js';
import { responseAt, seed, signIn } from './support.js';
import { loadAcceptanceConfig } from '../shared/config.js';

const id = 'SCN-DRAFT-003-P';
// AIDEV-NOTE: Run alone on a case/engine/attempt-owned disposable dataset; never reuse the diagnostic seed.
scenario(id, 'committed-save-lost-response-original-operation-newer-buffer', async (page, record) => {
  const config = loadAcceptanceConfig();
  expect(seed.kind).toBe('runtime');
  expect(seed.fixture_variant).toBe('base');
  expect(seed.fixture_identity).toMatchObject({ case_id: id, engine: page.context().browser()?.browserType().name(),
    attempt: test.info().retry, run_id: config.runId, dispatch_id: config.dispatchId });
  const writes: string[] = [];
  const lookups: URL[] = [];
  const observe = (request: Request): void => {
    const url = new URL(request.url());
    if (url.origin !== 'http://app.test') return;
    if (request.method() === 'PUT' && url.pathname.startsWith('/v1/drafts/')) writes.push(url.pathname);
    if (request.method() === 'GET' && url.pathname.startsWith('/v1/draft-operations/')) lookups.push(url);
  };
  let barrier: Awaited<ReturnType<typeof loseCommittedSave>> | undefined;
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
    barrier = await loseCommittedSave(page, draftId);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    const submitted = await barrier.committed;
    expect(submitted).toMatchObject({ mailbox_id: seed.mailboxes.primary, expected_version: 0,
      subject: original.subject, to: [{ display_name: 'Original', address: 'original@acceptance.test' }],
      body_text: original.body, reply_to_thread_id: null });
    const check = page.getByRole('button', { name: 'Check what the server stored', exact: true });
    await expect(check).toBeVisible();
    await expect(page.getByText('Not saved yet', { exact: true })).toBeVisible();
    await expect(subject).toHaveValue(original.subject);
    await expect(to).toHaveValue(original.to);
    await expect(body).toHaveValue(original.body);
    const newer = { subject: `  ${seed.data.marker} newer  `,
      to: '  New Name  <newer@acceptance.test>  \n\nsecond@acceptance.test\n',
      body: '\nNewer literal <script>text</script> & whitespace.\n\n' };
    await subject.fill(newer.subject);
    await to.fill(newer.to);
    await body.fill(newer.body);
    const [lookup] = await Promise.all([responseAt(page, `/v1/draft-operations/${submitted.operation_id}`),
      check.click()]);
    const applied = appliedReceipt.parse(await receiptJson(lookup));
    expect(applied.operation).toMatchObject({ operation_id: submitted.operation_id, draft_id: draftId,
      mailbox_id: submitted.mailbox_id, expected_version: 0, version: 1, state: 'editable', outcome: 'applied' });
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    await expect(subject).toHaveValue(newer.subject);
    await expect(to).toHaveValue(newer.to);
    await expect(body).toHaveValue(newer.body);
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await expect(check).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry this save', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    expect(writes).toEqual([`/v1/drafts/${draftId}`]);
    expect(lookups).toHaveLength(1);
    expect(lookups[0]?.pathname).toBe(`/v1/draft-operations/${submitted.operation_id}`);
    expect(lookups[0]?.searchParams.get('draft_id')).toBe(draftId);
    expect(lookups[0]?.searchParams.get('mailbox_id')).toBe(seed.mailboxes.primary);
    record.assertions.push('Genuine committed save loses response; original applied operation reconciles version while exact newer raw fields remain unsaved; one PUT and one original-ID lookup');
    record.evidence.push('Bounded strict real upstream PUT receipt and real applied ledger GET; no receipt bodies, credentials or draft content exported; no reload recovery claim');
  } finally {
    try { await barrier?.close(); }
    finally { page.off('request', observe); await page.close({ runBeforeUnload: false }); }
  }
});
