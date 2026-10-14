import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Request, Route } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { responseAt, seed, signIn } from './support.js';
import { loadAcceptanceConfig } from '../shared/config.js';

const id = 'SCN-DRAFT-008-F2';
const address = z.strictObject({ display_name: z.string().max(256).nullable(), address: z.string().max(256).nullable() });
const inputSchema = z.strictObject({ mailbox_id: z.uuid(), operation_id: z.uuid(),
  expected_version: z.number().int().min(0).max(2147483647), subject: z.string().max(998),
  to: z.array(address).max(100), body_text: z.string().max(65536), reply_to_thread_id: z.null() });
const receiptSchema = z.strictObject({ draft_id: z.uuid(), operation_id: z.uuid(),
  version: z.number().int().positive().max(2147483647), state: z.literal('editable') });

// AIDEV-NOTE: This case asserts the memory-only gap, not successful recovery of uncertain local intent.
scenario(id, 'committed-lost-ack-newer-buffer-memory-only-reload-gap', async (page, record) => {
  const config = loadAcceptanceConfig();
  expect(seed.kind).toBe('runtime');
  expect(seed.fixture_identity).toMatchObject({ case_id: id, engine: page.context().browser()?.browserType().name(),
    attempt: test.info().retry, run_id: config.runId, dispatch_id: config.dispatchId });
  const marker = `${id} ${randomUUID()}`;
  const committed = `${marker}\ncommitted <b>literal</b> text\n`;
  const newer = `${marker}\nnewer unsaved buffer\n`;
  await signIn(page, 'composer');
  await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts`);
  await page.getByRole('button', { name: 'New draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New draft', exact: true })).toBeVisible();
  await page.getByLabel('Subject', { exact: true }).fill(marker);
  await page.getByLabel('To', { exact: true }).fill('recipient@acceptance.test');
  await page.getByLabel('Message', { exact: true }).fill(committed);
  const draftId = z.uuid().parse(/\/drafts\/([0-9a-f-]{36})(?:\?|$)/.exec(new URL(page.url()).hash)?.[1]);
  const path = `/v1/drafts/${draftId}`;
  const writes: Request[] = [];
  const lookups: Request[] = [];
  const observe = (request: Request): void => {
    const url = new URL(request.url());
    if (url.origin !== config.baseURL) return;
    if (url.pathname === path && request.method() === 'PUT') writes.push(request);
    if (url.pathname.startsWith('/v1/draft-operations/')) lookups.push(request);
  };
  let resolve!: (value: z.infer<typeof inputSchema>) => void;
  let reject!: (error: Error) => void;
  const committedAttempt = new Promise<z.infer<typeof inputSchema>>((ok, fail) => { resolve = ok; reject = fail; });
  void committedAttempt.catch(() => undefined);
  const pending = new Set<Promise<void>>();
  let claimed = false;
  let barrierFailed = false;
  const matcher = (url: URL): boolean => url.origin === config.baseURL && url.pathname === path;
  const handle = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'PUT' || claimed) { await route.continue(); return; }
    claimed = true;
    try {
      const input = inputSchema.parse(route.request().postDataJSON() as unknown);
      expect(input).toMatchObject({ mailbox_id: seed.mailboxes.primary, expected_version: 0,
        subject: marker, body_text: committed, to: [{ display_name: null, address: 'recipient@acceptance.test' }] });
      // AIDEV-NOTE: Forward once, validate the real commit receipt, then lose only its transport acknowledgement.
      const upstream = await route.fetch({ timeout: 8000, maxRedirects: 0, maxRetries: 0 });
      try {
        expect(upstream.status()).toBe(200);
        expect(upstream.headers()['content-type']?.includes('application/json')).toBe(true);
        const bytes = await upstream.body();
        expect(bytes.length).toBeLessThanOrEqual(4096);
        expect(receiptSchema.parse(JSON.parse(bytes.toString('utf8')) as unknown)).toEqual({
          draft_id: draftId, operation_id: input.operation_id, version: 1, state: 'editable' });
        await route.abort('failed');
        resolve(input);
      } finally { await upstream.dispose(); }
    } catch {
      barrierFailed = true;
      reject(new Error('Real committed response-loss barrier failed'));
      await route.abort('failed').catch(() => undefined);
    }
  };
  const handler = (route: Route): Promise<void> => {
    const work = handle(route);
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => undefined);
    return work;
  };
  const timer = setTimeout(() => { barrierFailed = true; reject(new Error('Save interception deadline exceeded')); }, 15000);
  page.context().on('request', observe);
  try {
    await page.route(matcher, handler);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    const original = await committedAttempt;
    clearTimeout(timer);
    await expect(page.getByRole('button', { name: 'Retry this save', exact: true })).toBeEnabled();
    await expect(page.getByText('Saved version 1', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('note')).toContainText('recovery after a full reload is unavailable');
    await page.getByLabel('Message', { exact: true }).fill(newer);
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(newer);
    expect(inputSchema.parse(writes[0]?.postDataJSON() as unknown)).toEqual(original);
    expect(original.body_text === newer).toBe(false);
    await page.unroute(matcher, handler);
    await Promise.all([...pending]);
    expect(barrierFailed).toBe(false);
    // Accept any native unload warning explicitly; its presence is not a durability assertion.
    page.once('dialog', dialog => { void dialog.accept(); });
    const [detail] = await Promise.all([responseAt(page, path), page.reload()]);
    expect(detail.status()).toBe(200);
    expect(detail.headers()['content-type']?.includes('application/json')).toBe(true);
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(marker);
    await expect(page.getByLabel('To', { exact: true })).toHaveValue('recipient@acceptance.test');
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(committed);
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry this save', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check what the server stored', exact: true })).toHaveCount(0);
    await page.context().close();
    expect(writes.length).toBe(1);
    expect(lookups.length).toBe(0);
    record.assertions.push('Real PUT receipt binds original operation and version 1; lost ACK leaves uncertainty and newer local text');
    record.assertions.push('Reload GET reopens committed content; newer unsaved text and original retry controls are lost');
    record.evidence.push(`Original operation ${original.operation_id}; expected version 0; real receipt version 1; bodies not exported`);
    record.evidence.push('PRODUCT GAP OPEN: server saved reopening is not uncertain-buffer recovery; one PUT and zero ledger lookups through context close');
  } finally {
    clearTimeout(timer);
    page.context().off('request', observe);
    if (!page.isClosed()) await page.unroute(matcher, handler);
    await Promise.all([...pending]);
    if (barrierFailed) throw new Error('Real response-loss barrier failed');
  }
});
