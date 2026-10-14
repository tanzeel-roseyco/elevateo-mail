import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { scenario } from './cases.js';
import { seed, signIn } from './support.js';

const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const sessionSchema = z.object({ context_id: token, authorization_version: token,
  actor: z.object({ id: z.uuid() }).passthrough() }).passthrough();
const pageSchema = z.strictObject({ context_id: token, authorization_version: token,
  mailbox_id: z.uuid(), items: z.array(z.strictObject({ user_id: z.uuid() })).max(50),
  next_cursor: z.string().min(1).max(2048).nullable() });
const errorSchema = z.object({ code: z.string().min(1).max(64) }).passthrough();

// AIDEV-NOTE: This reads the real browser session and uses same-origin fetch; it never creates options or Auth users.
async function api(page: Page, path: string, headers: Record<string, string> = {}) {
  return page.evaluate(async ({ path, headers }) => {
    const response = await fetch(path, { credentials: 'same-origin', headers, signal: AbortSignal.timeout(10000) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 65536 || !response.headers.get('content-type')?.includes('application/json'))
      throw new Error('Assignee option API boundary invalid');
    return { status: response.status, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  }, { path, headers });
}

async function currentSession(page: Page) {
  const result = await api(page, '/v1/session');
  expect(result.status).toBe(200);
  const session = sessionSchema.parse(result.value);
  expect(session.actor.id).toBe(seed.actors.reader.user_id);
  return session;
}

function headers(session: z.infer<typeof sessionSchema>) {
  return { 'X-Session-Context': session.context_id,
    'X-Authorization-Version': session.authorization_version };
}

scenario('SCN-QA-826-P', 'current-mailbox-assignee-options-uuid-only', async (page, record) => {
  await signIn(page, 'reader');
  const session = await currentSession(page);
  const result = await api(page, `/v2/mailboxes/${seed.mailboxes.primary}/assignee-options?limit=50`, headers(session));
  expect(result.status).toBe(200);
  const options = pageSchema.parse(result.value);
  expect(options).toMatchObject({ context_id: session.context_id,
    authorization_version: session.authorization_version, mailbox_id: seed.mailboxes.primary });
  const expected = Object.entries(seed.expected_mailbox_memberships)
    .filter(([, memberships]) => memberships.some(member => member.mailbox_id === seed.mailboxes.primary))
    .map(([alias]) => seed.actors[alias as keyof typeof seed.actors].user_id).sort();
  expect(expected).toContain(seed.actors.composer.user_id);
  expect(options.next_cursor).toBeNull();
  expect(options.items.map(item => item.user_id).sort()).toEqual(expected);
  record.assertions.push('Real V2 options exactly match the private runtime seed eligible UUIDs, excluding other-org and revoked actors');
});

scenario('SCN-QA-826-F1', 'foreign-mailbox-options-are-unavailable', async (page, record) => {
  await signIn(page, 'reader');
  const session = await currentSession(page);
  const result = await api(page, `/v2/mailboxes/${seed.mailboxes.other}/assignee-options?limit=50`, headers(session));
  expect(result.status).toBe(404);
  expect(errorSchema.parse(result.value).code).toBe('not_available');
  record.assertions.push('Real V2 foreign mailbox option lookup is uniformly unavailable, without roster data');
});

scenario('SCN-QA-826-F2', 'malformed-option-cursor-is-rejected', async (page, record) => {
  await signIn(page, 'reader');
  const session = await currentSession(page);
  const result = await api(page, `/v2/mailboxes/${seed.mailboxes.primary}/assignee-options?limit=50&cursor=not-a-signed-cursor`,
    headers(session));
  expect(result.status).toBe(400);
  expect(errorSchema.parse(result.value).code).toBe('cursor_invalid');
  record.assertions.push('Real V2 malformed cursor is rejected before returning member UUIDs');
});
