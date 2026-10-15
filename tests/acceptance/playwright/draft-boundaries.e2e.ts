import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { receiptJson, saveInput } from './draft-recovery-support.js';
import { observeDraft } from './observer.js';
import { responseAt, seed, signIn } from './support.js';
import { loadAcceptanceConfig } from '../shared/config.js';

const id = 'SCN-DRAFT-001-F2';
const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const invalidReceipt = z.strictObject({ code: z.literal('request_invalid'),
  message: z.string().min(1).max(256), request_id: z.string().min(1).max(128) });

// AIDEV-NOTE: UI refusal and genuine API rejection share a valid session; SQL checks exclude silent persistence.
scenario(id, 'draft-limits-reject-with-unchanged-independent-database', async (page, record) => {
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
    await subject.fill(`${seed.data.marker} preserved`);
    await to.fill('recipient@acceptance.test');
    await body.fill('Original literal <b>buffer</b>\n');
    const [saved] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`, 'PUT'),
      page.getByRole('button', { name: 'Save draft', exact: true }).click()]);
    expect(await receiptJson(saved)).toMatchObject({ draft_id: draftId, version: 1, state: 'editable' });
    const raw = saved.request().postData();
    if (!raw || Buffer.byteLength(raw) > 1048576) throw new Error('Save input boundary rejected');
    const original = saveInput.parse(JSON.parse(raw) as unknown);
    const headers = { Origin: 'http://app.test',
      'X-Session-Context': token.parse(await saved.request().headerValue('X-Session-Context')),
      'X-Authorization-Version': token.parse(await saved.request().headerValue('X-Authorization-Version')),
      'X-CSRF-Token': token.parse(await saved.request().headerValue('X-CSRF-Token')) };
    const initial = { drafts: [{ id: draftId, version: 1, state: 'editable' }],
      operations: [{ operation_id: original.operation_id, outcome: 'applied', version: 1 }] };
    expect(await observeDraft(draftId, original.operation_id, 'before')).toEqual(initial);
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    const save = page.getByRole('button', { name: 'Save changes', exact: true });
    const oversizeSubject = '\u{1F680}'.repeat(999);
    const oversizeBody = 'x'.repeat(65537);
    const oversizeRecipients = Array.from({ length: 101 }, (_, index) => `person${index}@acceptance.test`);
    for (const boundary of [
      { input: subject, value: oversizeSubject, restore: original.subject,
        error: 'The subject is at most 998 characters.' },
      { input: body, value: oversizeBody, restore: original.body_text,
        error: 'The message is at most 65536 characters.' },
      { input: to, value: oversizeRecipients.join('\n'), restore: 'recipient@acceptance.test',
        error: 'At most 100 recipients.' },
    ]) {
      await boundary.input.fill(boundary.value);
      await expect(boundary.input).toHaveValue(boundary.value);
      await expect(boundary.input).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText(boundary.error, { exact: true })).toBeVisible();
      await expect(save).toBeDisabled();
      await boundary.input.fill(boundary.restore);
    }
    expect(writes).toHaveLength(1);
    // AIDEV-NOTE: Bypass client validation without invalidating Origin/context/CSRF; a legal control follows.
    for (const content of [{ subject: oversizeSubject }, { body_text: oversizeBody },
      { to: oversizeRecipients.map(address => ({ display_name: null, address })) }]) {
      const operationId = randomUUID();
      const response = await page.request.put(`/v1/drafts/${draftId}`, { headers, maxRedirects: 0,
        data: { ...original, expected_version: 1, operation_id: operationId, ...content } });
      expect(response.status()).toBe(400);
      expect(response.headers()['content-type']?.includes('application/json')).toBe(true);
      const bytes = await response.body();
      expect(bytes.length).toBeLessThanOrEqual(4096);
      invalidReceipt.parse(JSON.parse(bytes.toString('utf8')) as unknown);
      expect(await observeDraft(draftId, operationId, 'after')).toEqual({ drafts: initial.drafts, operations: [] });
    }
    expect(await observeDraft(draftId, original.operation_id, 'after')).toEqual(initial);
    await page.reload();
    await expect(subject).toHaveValue(original.subject);
    await expect(body).toHaveValue(original.body_text);
    await expect(to).toHaveValue('recipient@acceptance.test');
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    // AIDEV-NOTE: An exact-limit non-BMP value proves code-point counting and excludes a broken write context.
    const legalSubject = '\u{1F680}'.repeat(998);
    const operationId = randomUUID();
    const control = await page.request.put(`/v1/drafts/${draftId}`, { headers, maxRedirects: 0,
      data: { ...original, expected_version: 1, operation_id: operationId, subject: legalSubject } });
    expect(await receiptJson(control)).toEqual({ draft_id: draftId, operation_id: operationId,
      version: 2, state: 'editable' });
    expect(await observeDraft(draftId, operationId, 'after')).toEqual({
      drafts: [{ id: draftId, version: 2, state: 'editable' }],
      operations: [{ operation_id: operationId, outcome: 'applied', version: 2 }] });
    await page.reload();
    await expect(subject).toHaveValue(legalSubject);
    await expect(body).toHaveValue(original.body_text);
    await expect(page.getByText('Saved version 2', { exact: true })).toBeVisible();
    await page.close({ runBeforeUnload: false });
    expect(writes).toHaveLength(1);
    record.assertions.push('Oversized subject, body and recipient count retain raw input and disable save; three genuine API refusals leave draft and operation ledger unchanged');
    record.assertions.push('Reload retains the original content; exact 998-code-point subject succeeds with the same write headers and persists as version 2');
    record.evidence.push('Independent SQL before and after refusal/control, genuine authenticated PUTs and reload reads, no exported payloads or credentials');
  } finally {
    page.off('request', observe);
    await page.close({ runBeforeUnload: false });
  }
});
