// R1: boundary schemas accept the canonical cases and reject malformed ones, and z.infer of each
// schema stays assignable to the generated component type in both directions (compile-time pins).
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import fixtures from '../../../../contracts/v1/fixtures.json'
import {
  AcceptInputSchema,
  AuthAcceptedSchema,
  AuthChallengeSchema,
  AuthLifecycleSchema,
  AuthLogoutSchema,
  ErrorSchema,
  LoginInputSchema,
  LogoutInputSchema,
  MailboxPageSchema,
  OrganizationInputSchema,
  OrganizationPageSchema,
  RecoveryInputSchema,
  SessionSchema,
  ThreadDetailPageSchema,
  ThreadPageSchema,
  type AcceptInput,
  type ApiError,
  type AuthAccepted,
  type AuthChallenge,
  type AuthLifecycle,
  type AuthLogout,
  type LoginInput,
  type LogoutInput,
  type MailboxPage,
  type OrganizationInput,
  type OrganizationPage,
  type RecoveryInput,
  type Session,
  type ThreadDetailPage,
  type ThreadPage,
} from './contract'

// Two-way assignability: a drifted schema fails typecheck here, not at runtime in production.
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const _session: Mutual<z.infer<typeof SessionSchema>, Session> = true
const _mailboxPage: Mutual<z.infer<typeof MailboxPageSchema>, MailboxPage> = true
const _threadPage: Mutual<z.infer<typeof ThreadPageSchema>, ThreadPage> = true
const _detail: Mutual<z.infer<typeof ThreadDetailPageSchema>, ThreadDetailPage> = true
const _error: Mutual<z.infer<typeof ErrorSchema>, ApiError> = true
// BE-02A lifecycle pins (RefreshInput is an empty object and is not pinned).
const _challenge: Mutual<z.infer<typeof AuthChallengeSchema>, AuthChallenge> = true
const _lifecycle: Mutual<z.infer<typeof AuthLifecycleSchema>, AuthLifecycle> = true
const _accepted: Mutual<z.infer<typeof AuthAcceptedSchema>, AuthAccepted> = true
const _logout: Mutual<z.infer<typeof AuthLogoutSchema>, AuthLogout> = true
const _organizations: Mutual<z.infer<typeof OrganizationPageSchema>, OrganizationPage> = true
const _loginInput: Mutual<z.infer<typeof LoginInputSchema>, LoginInput> = true
const _recoveryInput: Mutual<z.infer<typeof RecoveryInputSchema>, RecoveryInput> = true
const _acceptInput: Mutual<z.infer<typeof AcceptInputSchema>, AcceptInput> = true
const _logoutInput: Mutual<z.infer<typeof LogoutInputSchema>, LogoutInput> = true
const _organizationInput: Mutual<z.infer<typeof OrganizationInputSchema>, OrganizationInput> = true
void [_session, _mailboxPage, _threadPage, _detail, _error]
void [_challenge, _lifecycle, _accepted, _logout, _organizations, _loginInput, _recoveryInput, _acceptInput, _logoutInput, _organizationInput]

const examples = fixtures.examples as Record<string, { status: number; body: unknown }>

describe('canonical fixture examples validate', () => {
  const rows: Array<[string, z.ZodType]> = [
    ['session_a', SessionSchema],
    ['session_b', SessionSchema],
    ['mailboxes', MailboxPageSchema],
    ['mailboxes_empty', MailboxPageSchema],
    ['threads', ThreadPageSchema],
    ['threads_empty', ThreadPageSchema],
    ['thread_hostile_plaintext', ThreadDetailPageSchema],
    ['thread_empty', ThreadDetailPageSchema],
    ['thread_truncated', ThreadDetailPageSchema],
  ]
  it.each(rows)('%s matches its schema', (name, schema) => {
    expect(schema.safeParse(examples[name]?.body).success).toBe(true)
  })

  it.each(Object.keys(fixtures.error_status_codes).flatMap((status) =>
    (fixtures.error_status_codes as Record<string, string[]>)[status]!.map((code) => code),
  ))('error example %s matches the Error schema', (code) => {
    expect(ErrorSchema.safeParse(examples[code]?.body).success).toBe(true)
  })
})

describe('malformed payloads are rejected', () => {
  const session = examples['session_a']!.body as Record<string, unknown>
  it('rejects unknown extra fields', () => {
    expect(SessionSchema.safeParse({ ...session, surprise: 1 }).success).toBe(false)
  })
  it('rejects a missing csrf_token', () => {
    const rest = { ...session }
    delete rest.csrf_token
    expect(SessionSchema.safeParse(rest).success).toBe(false)
  })
  it('rejects simulation_mode false', () => {
    expect(SessionSchema.safeParse({ ...session, simulation_mode: false }).success).toBe(false)
  })
  it('rejects an opaque token with invalid characters or short length', () => {
    expect(SessionSchema.safeParse({ ...session, context_id: 'short' }).success).toBe(false)
    expect(SessionSchema.safeParse({ ...session, context_id: 'bad token with spaces!' }).success).toBe(false)
  })
  it('rejects an oversized message body field', () => {
    const detail = structuredClone(examples['thread_truncated']!.body) as { messages: Array<{ body_text: string }> }
    detail.messages[0]!.body_text = 'x'.repeat(16385)
    expect(ThreadDetailPageSchema.safeParse(detail).success).toBe(false)
  })
  it('rejects more than 50 thread summaries per page', () => {
    const page = structuredClone(examples['threads']!.body) as { items: unknown[] }
    const item = page.items[0]
    page.items = Array.from({ length: 51 }, () => structuredClone(item))
    expect(ThreadPageSchema.safeParse(page).success).toBe(false)
  })
  it('rejects an unknown error code', () => {
    expect(ErrorSchema.safeParse({ code: 'mystery', message: 'x', request_id: 'r1' }).success).toBe(false)
  })
})

// AIDEV-NOTE: Pin the 16,384-character schema limit with BMP Unicode; transport separately bounds UTF-8 bytes.
describe('exact contract boundaries', () => {
  it.each([50, 51])('mailbox page entry limit: %i', (count) => {
    const page = structuredClone(fixtures.examples.mailboxes.body)
    page.items = Array.from({ length: count }, () => structuredClone(page.items[0]!))
    expect(MailboxPageSchema.safeParse(page).success).toBe(count === 50)
  })
  it.each([20, 21])('message page entry limit: %i', (count) => {
    const page = structuredClone(fixtures.examples.thread_truncated.body)
    page.messages = Array.from({ length: count }, () => structuredClone(page.messages[0]!))
    expect(ThreadDetailPageSchema.safeParse(page).success).toBe(count === 20)
  })
  it.each([16384, 16385])('Unicode message character bound: %i characters', (count) => {
    const page = structuredClone(fixtures.examples.thread_truncated.body)
    page.messages[0]!.body_text = '\u00e9'.repeat(count)
    expect(ThreadDetailPageSchema.safeParse(page).success).toBe(count === 16384)
  })
  it('rejects malformed actor IDs and timestamps', () => {
    const session = structuredClone(fixtures.examples.session_a.body)
    session.actor.id = 'not-a-uuid'
    expect(SessionSchema.safeParse(session).success).toBe(false)
    const page = structuredClone(fixtures.examples.thread_truncated.body)
    expect(ThreadDetailPageSchema.safeParse({ ...page, messages: [{ ...page.messages[0]!, sent_at: 'yesterday' }] }).success).toBe(false)
  })
  it('accepts nested nullable fields but rejects null collections and required objects', () => {
    const page = structuredClone(fixtures.examples.thread_truncated.body)
    const message = page.messages[0]!
    expect(ThreadDetailPageSchema.safeParse({ ...page, messages: [{ ...message, sender: null, sent_at: null, to: [{ address: null, display_name: null }] }] }).success).toBe(true)
    expect(ThreadDetailPageSchema.safeParse({ ...page, messages: null }).success).toBe(false)
    expect(ThreadDetailPageSchema.safeParse({ ...page, thread: null }).success).toBe(false)
    expect(ThreadDetailPageSchema.safeParse({ ...page, messages: [{ ...message, to: [null] }] }).success).toBe(false)
  })
})

// BE-02A: lifecycle examples and browser-side input bounds (contract README "Acceptance").
const lifecycle = fixtures.lifecycle_examples as Record<string, { value: unknown }>

describe('lifecycle responses', () => {
  it('canonical lifecycle examples validate', () => {
    expect(AuthChallengeSchema.safeParse(lifecycle['challenge']?.value).success).toBe(true)
    expect(AuthLogoutSchema.safeParse(lifecycle['logout_pending']?.value).success).toBe(true)
    expect(AuthAcceptedSchema.safeParse(lifecycle['recovery_accepted']?.value).success).toBe(true)
  })
  it('a lifecycle result embeds the unchanged Session and a UTC timestamp', () => {
    const session = examples['session_a']!.body
    expect(AuthLifecycleSchema.safeParse({ session, access_expires_at: '2026-10-13T01:00:00Z' }).success).toBe(true)
    expect(AuthLifecycleSchema.safeParse({ session, access_expires_at: 'soon' }).success).toBe(false)
    expect(AuthLifecycleSchema.safeParse({ session: { ...(session as object), csrf_token: undefined }, access_expires_at: '2026-10-13T01:00:00Z' }).success).toBe(false)
    expect(AuthLifecycleSchema.safeParse({ session, access_expires_at: '2026-10-13T01:00:00Z', extra: 1 }).success).toBe(false)
  })
  it('rejects a challenge token outside the opaque-token alphabet and non-literal flags', () => {
    expect(AuthChallengeSchema.safeParse({ csrf_token: 'not valid!', expires_at: '2026-10-13T00:05:00Z' }).success).toBe(false)
    expect(AuthAcceptedSchema.safeParse({ accepted: false }).success).toBe(false)
    expect(AuthLogoutSchema.safeParse({ local_revoked: false, upstream_status: 'pending' }).success).toBe(false)
    expect(AuthLogoutSchema.safeParse({ local_revoked: true, upstream_status: 'later' }).success).toBe(false)
  })
  it('an organization page is bounded like every other page', () => {
    const base = { context_id: 'context_A_0123456789', authorization_version: 'authz_A_0123456789', next_cursor: null }
    const org = { id: '00000000-0000-4000-8000-000000000011', name: 'Org' }
    expect(OrganizationPageSchema.safeParse({ ...base, items: [] }).success).toBe(true)
    expect(OrganizationPageSchema.safeParse({ ...base, items: Array.from({ length: 51 }, () => org) }).success).toBe(false)
    expect(OrganizationPageSchema.safeParse({ ...base, items: [{ ...org, members: 3 }] }).success).toBe(false)
  })
})

describe('lifecycle inputs are bounded in the browser', () => {
  it('login requires a syntactically valid email of at most 320 characters and a non-empty password', () => {
    expect(LoginInputSchema.safeParse({ email: 'a@example.test', password: 'x' }).success).toBe(true)
    expect(LoginInputSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false)
    expect(LoginInputSchema.safeParse({ email: `${'a'.repeat(310)}@example.test`, password: 'x' }).success).toBe(false)
    expect(LoginInputSchema.safeParse({ email: 'a@example.test', password: '' }).success).toBe(false)
    expect(LoginInputSchema.safeParse({ email: 'a@example.test', password: 'x', remember: true }).success).toBe(false)
  })
  it('passwords are bounded by UTF-8 bytes, not characters', () => {
    expect(LoginInputSchema.safeParse({ email: 'a@example.test', password: 'x'.repeat(1024) }).success).toBe(true)
    expect(LoginInputSchema.safeParse({ email: 'a@example.test', password: 'x'.repeat(1025) }).success).toBe(false)
    // 4-byte code points: 256 of them are 1024 bytes, 257 exceed it although only 257 characters long.
    expect(LoginInputSchema.safeParse({ email: 'a@example.test', password: '\u{1F48C}'.repeat(256) }).success).toBe(true)
    expect(LoginInputSchema.safeParse({ email: 'a@example.test', password: '\u{1F48C}'.repeat(257) }).success).toBe(false)
  })
  it('entry completion requires at least 12 characters, counted in code points', () => {
    expect(AcceptInputSchema.safeParse({ password: 'x'.repeat(11) }).success).toBe(false)
    expect(AcceptInputSchema.safeParse({ password: 'x'.repeat(12) }).success).toBe(true)
    expect(AcceptInputSchema.safeParse({ password: '\u{1F48C}'.repeat(12) }).success).toBe(true) // 12 code points, 24 UTF-16 units
    expect(AcceptInputSchema.safeParse({ password: '\u{1F48C}'.repeat(11) }).success).toBe(false)
  })
  it('logout scope and organization ids are closed enumerations', () => {
    expect(LogoutInputSchema.safeParse({ scope: 'global' }).success).toBe(true)
    expect(LogoutInputSchema.safeParse({ scope: 'everywhere' }).success).toBe(false)
    expect(LogoutInputSchema.safeParse({ scope: 'local', user_id: 'x' }).success).toBe(false)
    expect(OrganizationInputSchema.safeParse({ organization_id: '00000000-0000-4000-8000-000000000011' }).success).toBe(true)
    expect(OrganizationInputSchema.safeParse({ organization_id: 'org-1' }).success).toBe(false)
  })
})
