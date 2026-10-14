import { expect } from '@playwright/test';
import type { APIResponse, Page, Response, Route } from '@playwright/test';
import { z } from 'zod';

// AIDEV-NOTE: Acceptance mirrors only the frozen draft wire boundaries, without importing production code.
const version = z.number().int().min(0).max(2147483647);
const text = (max: number) => z.string().refine(value => Array.from(value).length <= max);
const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const address = z.strictObject({ display_name: text(256).nullable(), address: text(256).nullable() });
export const saveInput = z.strictObject({ mailbox_id: z.uuid(), operation_id: z.uuid(),
  expected_version: version, subject: text(998), to: z.array(address).max(100),
  body_text: text(65536), reply_to_thread_id: z.uuid().nullable() });
const saveReceipt = z.strictObject({ draft_id: z.uuid(), operation_id: z.uuid(),
  version: version.min(1), state: z.literal('editable') });
export const appliedReceipt = z.strictObject({ context_id: token, authorization_version: token,
  operation: z.strictObject({ operation_id: z.uuid(), mailbox_id: z.uuid(), draft_id: z.uuid(),
    outcome: z.literal('applied'), expected_version: version, version: version.min(1),
    state: z.literal('editable'), recorded_at: z.iso.datetime(), detail_expires_at: z.iso.datetime() }) });

export async function receiptJson(response: APIResponse | Response): Promise<unknown> {
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']?.includes('application/json')).toBe(true);
  const bytes = await response.body();
  if (bytes.length > 65536) throw new Error('Draft receipt exceeds boundary');
  return JSON.parse(bytes.toString('utf8')) as unknown;
}

// AIDEV-NOTE: Only a genuine upstream committed receipt permits response loss; extra PUTs are never forwarded.
export async function loseCommittedSave(page: Page, draftId: string) {
  let resolve!: (input: z.infer<typeof saveInput>) => void;
  let reject!: (error: Error) => void;
  const committed = new Promise<z.infer<typeof saveInput>>((yes, no) => { resolve = yes; reject = no; });
  void committed.catch(() => undefined);
  let claimed = false;
  let failed = false;
  const pending = new Set<Promise<void>>();
  const timer = setTimeout(() => { failed = true; reject(new Error('Commit receipt deadline exceeded')); }, 10000);
  const matcher = (url: URL): boolean => url.origin === 'http://app.test'
    && url.pathname === `/v1/drafts/${draftId}`;
  const handle = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'PUT') { await route.continue(); return; }
    let upstream: APIResponse | undefined;
    try {
      if (claimed) throw new Error('Duplicate save request');
      claimed = true;
      const raw = route.request().postData();
      if (raw === null || Buffer.byteLength(raw) > 1048576) throw new Error('Save input boundary rejected');
      const input = saveInput.parse(JSON.parse(raw) as unknown);
      upstream = await route.fetch({ timeout: 8000, maxRedirects: 0, maxRetries: 0 });
      const receipt = saveReceipt.parse(await receiptJson(upstream));
      expect(receipt).toEqual({ draft_id: draftId, operation_id: input.operation_id,
        version: input.expected_version + 1, state: 'editable' });
      if (failed) throw new Error('Commit receipt deadline exceeded');
      await route.abort('failed');
      resolve(input);
    } catch {
      failed = true;
      reject(new Error('Real committed save barrier failed'));
      await route.abort('failed').catch(() => undefined);
    } finally {
      clearTimeout(timer);
      try { await upstream?.dispose(); }
      catch { failed = true; reject(new Error('Upstream receipt cleanup failed')); }
    }
  };
  const handler = (route: Route): Promise<void> => {
    const work = handle(route);
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => undefined);
    return work;
  };
  try { await page.route(matcher, handler); }
  catch { clearTimeout(timer); throw new Error('Save route registration failed'); }
  return { committed, close: async (): Promise<void> => {
    clearTimeout(timer);
    await page.unroute(matcher, handler);
    await Promise.all([...pending]);
    if (failed) throw new Error('Real committed save barrier failed');
  } };
}
