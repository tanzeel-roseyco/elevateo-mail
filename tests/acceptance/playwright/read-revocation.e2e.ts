import { expect, test } from '@playwright/test';
import type { Page, Request, Response } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { mailbox, openThread, responseAt, seed, signIn } from './support.js';
import { loadAcceptanceConfig } from '../shared/config.js';

// AIDEV-NOTE: Narrow wire validators mirror contracts/v1; acceptance has its own TypeScript root.
const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const boundedText = (max: number) => z.string().refine(value => Array.from(value).length <= max);
const envelope = { context_id: token, authorization_version: token };
const capabilities = z.strictObject({ compose: z.boolean(), approve_send: z.boolean(), manage_members: z.boolean() });
const member = z.strictObject({ user_id: z.uuid(), capabilities });
const revision = z.number().int().min(0).max(2147483647);
const SessionSchema = z.strictObject({ ...envelope, csrf_token: token, simulation_mode: z.literal(true),
  actor: z.strictObject({ id: z.uuid(), display_name: boundedText(256).nullable() }),
  organization: z.strictObject({ id: z.uuid(), name: boundedText(256) }) });
const MailboxMemberPageSchema = z.strictObject({ ...envelope, mailbox_id: z.uuid(), membership_version: revision,
  next_cursor: z.null(), items: z.array(member).max(50) });
const MailboxMembershipResultSchema = z.strictObject({ ...envelope, mailbox_id: z.uuid(), user_id: z.uuid(),
  membership_version: revision, member: member.nullable() });
const MailboxPageSchema = z.strictObject({ ...envelope, next_cursor: z.null(), items: z.array(z.never()).length(0) });
const ErrorSchema = z.strictObject({ code: z.literal('context_changed'), message: boundedText(256),
  request_id: boundedText(128).refine(value => value.length > 0) });

const id = 'SCN-READ-001-F2';
const rosterPath = `/v1/mailboxes/${seed.mailboxes.primary}/members`;
const memberPath = `${rosterPath}/${seed.actors.reader.user_id}`;

// AIDEV-NOTE: Genuine browser fetch supplies Origin and cookies; no session or business response is fabricated.
async function api(page: Page, path: string, method = 'GET', headers: Record<string, string> = {},
  body?: unknown): Promise<{ status: number; value: unknown }> {
  return page.evaluate(async ({ path, method, headers, body }) => {
    const response = await fetch(path, { method, credentials: 'same-origin',
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 262144 || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Invalid API response boundary');
    }
    return { status: response.status, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  }, { path, method, headers, body });
}
async function json(response: Response): Promise<unknown> {
  const bytes = await response.body();
  if (bytes.length > 262144 || !response.headers()['content-type']?.includes('application/json')) {
    throw new Error('Invalid browser response boundary');
  }
  return JSON.parse(bytes.toString('utf8')) as unknown;
}
async function roster(manager: Page) {
  const sessionResult = await api(manager, '/v1/session');
  expect(sessionResult.status).toBe(200);
  const session = SessionSchema.parse(sessionResult.value);
  expect(session.actor.id).toBe(seed.actors.manager_primary.user_id);
  expect(session.organization.id).toBe(seed.organizations.primary);
  const headers = { 'X-Session-Context': session.context_id,
    'X-Authorization-Version': session.authorization_version, 'X-CSRF-Token': session.csrf_token };
  const result = await api(manager, `${rosterPath}?limit=50`, 'GET', headers);
  expect(result.status).toBe(200);
  const page = MailboxMemberPageSchema.parse(result.value);
  expect(page.mailbox_id).toBe(seed.mailboxes.primary);
  expect(page.context_id).toBe(session.context_id);
  expect(page.authorization_version).toBe(session.authorization_version);
  expect(page.next_cursor).toBeNull(); // The dedicated nine-actor dataset fits one bounded page.
  expect(new Set(page.items.map(item => item.user_id)).size).toBe(page.items.length);
  expect(page.items.find(item => item.user_id === session.actor.id)?.capabilities.manage_members).toBe(true);
  return { page, headers };
}

scenario(id, 'real-manager-live-reader-revocation', async (victim, record) => {
  const config = loadAcceptanceConfig();
  expect(seed.kind).toBe('runtime');
  expect(seed.fixture_identity).toMatchObject({ case_id: id, engine: victim.context().browser()?.browserType().name(),
    attempt: test.info().retry, run_id: config.runId, dispatch_id: config.dispatchId });
  const managerContext = await victim.context().browser()!.newContext({ baseURL: 'http://app.test' });
  const manager = await managerContext.newPage();
  let original: z.infer<typeof MailboxMemberPageSchema> | undefined;
  let mutationAttempted = false;
  let recoveryRequests = 0;
  const countRecovery = (request: Request): void => {
    const url = new URL(request.url());
    if (url.origin === 'http://app.test' && url.pathname === '/v1/session') recoveryRequests += 1;
  };
  try {
    await signIn(manager, 'manager_primary');
    await signIn(victim, 'reader');
    await mailbox(victim);
    const detailPath = `/v1/threads/${seed.data.thread_primary}`;
    const detailPending = responseAt(victim, detailPath);
    await openThread(victim);
    const detail = await detailPending;
    expect(detail.status()).toBe(200);
    const staleHeaders = await detail.request().allHeaders();
    expect(staleHeaders['x-session-context']).toBeTruthy();
    expect(staleHeaders['x-authorization-version']).toBeTruthy();
    const before = await roster(manager);
    original = before.page;
    const grant = original.items.find(item => item.user_id === seed.actors.reader.user_id);
    if (!grant) throw new Error('Reader grant missing');
    expect(grant.capabilities).toEqual({ compose: false, approve_send: false, manage_members: false });
    mutationAttempted = true; // Includes ambiguous transport failure; finally reconciles the real roster.
    const removed = await api(manager, `${memberPath}?expected_membership_version=${original.membership_version}`,
      'DELETE', before.headers);
    expect(removed.status).toBe(200);
    const receipt = MailboxMembershipResultSchema.parse(removed.value);
    expect(receipt).toMatchObject({ mailbox_id: seed.mailboxes.primary, user_id: grant.user_id,
      membership_version: original.membership_version + 1, member: null });
    const after = await roster(manager);
    expect(after.page.items).toEqual(original.items.filter(item => item.user_id !== grant.user_id));
    expect(after.page.membership_version).toBe(receipt.membership_version);
    victim.on('request', countRecovery);
    const listPath = `/v1/mailboxes/${seed.mailboxes.primary}/threads`;
    const stalePending = responseAt(victim, listPath);
    const recoveryPending = responseAt(victim, '/v1/session');
    const mailboxesPending = responseAt(victim, '/v1/mailboxes');
    // AIDEV-NOTE: Hash navigation retains React/session memory and triggers a real stale-context list request.
    await victim.evaluate(mailboxId => { location.hash = `/mailboxes/${mailboxId}`; }, seed.mailboxes.primary);
    const stale = await stalePending;
    expect(stale.status()).toBe(409);
    const sent = await stale.request().allHeaders();
    expect(sent['x-session-context']).toBe(staleHeaders['x-session-context']);
    expect(sent['x-authorization-version']).toBe(staleHeaders['x-authorization-version']);
    expect(ErrorSchema.parse(await json(stale)).code).toBe('context_changed');
    const recovered = await recoveryPending;
    expect(recovered.status()).toBe(200);
    const fresh = SessionSchema.parse(await json(recovered));
    expect(fresh.actor.id).toBe(grant.user_id);
    expect(fresh.authorization_version).not.toBe(staleHeaders['x-authorization-version']);
    const boxes = await mailboxesPending;
    expect(boxes.status()).toBe(200);
    const collection = MailboxPageSchema.parse(await json(boxes));
    expect(collection).toMatchObject({ context_id: fresh.context_id,
      authorization_version: fresh.authorization_version, next_cursor: null, items: [] });
    await expect(victim.getByText('No mailboxes are visible to you.', { exact: true })).toBeVisible();
    await expect(victim.locator('a[data-thread], pre')).toHaveCount(0);
    await expect(victim.getByRole('article', { name: 'Conversation', exact: true })).toHaveCount(0);
    await expect(victim.getByText(seed.data.marker, { exact: false })).toHaveCount(0);
    await expect(victim.locator(`a[href="#/mailboxes/${seed.mailboxes.primary}"]`)).toHaveCount(0);
    expect(recoveryRequests).toBe(1);
    // AIDEV-NOTE: A negative observation deadline bounds unsolicited recovery; it does not establish race ordering.
    await new Promise<void>((resolve, reject) => {
      const unexpected = (request: Request): void => {
        if (new URL(request.url()).origin === 'http://app.test' && new URL(request.url()).pathname === '/v1/session') {
          clearTimeout(deadline); victim.off('request', unexpected); reject(new Error('Repeated recovery'));
        }
      };
      const deadline = setTimeout(() => { victim.off('request', unexpected); resolve(); }, 2000);
      victim.on('request', unexpected);
    });
    expect(recoveryRequests).toBe(1);
    const deniedPending = responseAt(victim, detailPath);
    await victim.evaluate(path => { location.hash = path; },
      `/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_primary}`);
    const denied = await deniedPending;
    expect(denied.status()).toBe(404);
    expect(ErrorSchema.extend({ code: z.literal('not_available') }).parse(await json(denied)).code).toBe('not_available');
    await expect(victim.locator('a[data-thread], pre')).toHaveCount(0);
    await expect(victim.getByText(seed.data.marker, { exact: false })).toHaveCount(0);
    expect(recoveryRequests).toBe(1);
    record.assertions.push('Genuine manager revocation rejects stale reader context; one recovery excludes mailbox and clears cached mail');
    record.evidence.push('Separate authenticated browser identities; real bounded API receipts; no synthetic business responses');
  } finally {
    victim.off('request', countRecovery);
    try {
      if (mutationAttempted && original) {
        const current = await roster(manager);
        const target = original.items.find(item => item.user_id === seed.actors.reader.user_id);
        if (!target) throw new Error('Restoration grant missing');
        const present = current.page.items.find(item => item.user_id === target.user_id);
        if (present) {
          expect(current.page).toEqual(original); // Failed DELETE must have made no changes.
        } else {
          expect(current.page.membership_version).toBe(original.membership_version + 1);
          expect(current.page.items).toEqual(original.items.filter(item => item.user_id !== target.user_id));
          const restored = await api(manager, memberPath, 'PUT', current.headers,
            { expected_membership_version: current.page.membership_version, capabilities: target.capabilities });
          expect(restored.status).toBe(200);
          expect(MailboxMembershipResultSchema.parse(restored.value)).toMatchObject({ mailbox_id: seed.mailboxes.primary,
            user_id: target.user_id, membership_version: original.membership_version + 2, member: target });
          const final = await roster(manager);
          expect(final.page.items).toEqual(original.items);
          expect(final.page.membership_version).toBe(original.membership_version + 2);
        }
      }
    } finally { await managerContext.close(); }
  }
});
