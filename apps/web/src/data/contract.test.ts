// R1: boundary schemas accept the canonical cases and reject malformed ones, and z.infer of each
// schema stays assignable to the generated component type in both directions (compile-time pins).
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import fixtures from '../../../../contracts/v1/fixtures.json'
import type { components } from './generated/api'
import {
  ErrorSchema,
  MailboxPageSchema,
  SessionSchema,
  ThreadDetailPageSchema,
  ThreadPageSchema,
  type ApiError,
  type MailboxPage,
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
void [_session, _mailboxPage, _threadPage, _detail, _error]
type _componentsUsed = components['schemas']['Mailbox']

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
    const { csrf_token: _omit, ...rest } = session
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
