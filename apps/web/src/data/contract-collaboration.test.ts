// BE-02 C/D (contract 1.0.0-collaboration.1): every collaboration schema is pinned two-way to its
// generated component type, every canonical cd_examples/cd_requests payload validates against the
// schema it names, and the exact code-point, count and revision bounds reject off-by-one values
// before anything reaches the UI. Boundary tests build from the canonical payloads so a schema
// drift shows up as a named example, not as an invented object.
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import fixtures from '../../../../contracts/v1/fixtures.json'
import { COLLABORATION_ERROR_CODES } from './errors'
import {
  CollaborationErrorSchema,
  DraftOperationResponseSchema,
  DraftOperationSchema,
  DraftPageSchema,
  DraftResponseSchema,
  DraftSaveInputSchema,
  DraftSaveResultSchema,
  DraftSchema,
  DraftSummarySchema,
  MailboxMemberInputSchema,
  MailboxMemberPageSchema,
  MailboxMemberSchema,
  MailboxMembershipResultSchema,
  MailboxPageSchema,
  MembershipCapabilitiesSchema,
  MembershipDeleteQuerySchema,
  SearchPageSchema,
  SearchQuerySchema,
  ThreadAssignmentInputSchema,
  ThreadAssignmentSchema,
  ThreadNoteInputSchema,
  ThreadNotePageSchema,
  ThreadNoteResponseSchema,
  ThreadNoteSchema,
  ThreadReadStateInputSchema,
  ThreadReadStateSchema,
  type CollaborationError,
  type Draft,
  type DraftOperation,
  type DraftOperationResponse,
  type DraftPage,
  type DraftResponse,
  type DraftSaveInput,
  type DraftSaveResult,
  type DraftSummary,
  type MailboxMember,
  type MailboxMemberInput,
  type MailboxMemberPage,
  type MailboxMembershipResult,
  type MembershipCapabilities,
  type SearchPage,
  type ThreadAssignment,
  type ThreadAssignmentInput,
  type ThreadNote,
  type ThreadNoteInput,
  type ThreadNotePage,
  type ThreadNoteResponse,
  type ThreadReadState,
  type ThreadReadStateInput,
} from './contract'

// Two-way assignability against the generated types (same technique as contract.test.ts).
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const _cdError: Mutual<z.infer<typeof CollaborationErrorSchema>, CollaborationError> = true
const _draft: Mutual<z.infer<typeof DraftSchema>, Draft> = true
const _draftSaveInput: Mutual<z.infer<typeof DraftSaveInputSchema>, DraftSaveInput> = true
const _draftSaveResult: Mutual<z.infer<typeof DraftSaveResultSchema>, DraftSaveResult> = true
const _draftResponse: Mutual<z.infer<typeof DraftResponseSchema>, DraftResponse> = true
const _draftSummary: Mutual<z.infer<typeof DraftSummarySchema>, DraftSummary> = true
const _draftPage: Mutual<z.infer<typeof DraftPageSchema>, DraftPage> = true
const _draftOperation: Mutual<z.infer<typeof DraftOperationSchema>, DraftOperation> = true
const _draftOperationResponse: Mutual<z.infer<typeof DraftOperationResponseSchema>, DraftOperationResponse> = true
const _readState: Mutual<z.infer<typeof ThreadReadStateSchema>, ThreadReadState> = true
const _readStateInput: Mutual<z.infer<typeof ThreadReadStateInputSchema>, ThreadReadStateInput> = true
const _assignment: Mutual<z.infer<typeof ThreadAssignmentSchema>, ThreadAssignment> = true
const _assignmentInput: Mutual<z.infer<typeof ThreadAssignmentInputSchema>, ThreadAssignmentInput> = true
const _note: Mutual<z.infer<typeof ThreadNoteSchema>, ThreadNote> = true
const _noteInput: Mutual<z.infer<typeof ThreadNoteInputSchema>, ThreadNoteInput> = true
const _noteResponse: Mutual<z.infer<typeof ThreadNoteResponseSchema>, ThreadNoteResponse> = true
const _notePage: Mutual<z.infer<typeof ThreadNotePageSchema>, ThreadNotePage> = true
const _capabilities: Mutual<z.infer<typeof MembershipCapabilitiesSchema>, MembershipCapabilities> = true
const _member: Mutual<z.infer<typeof MailboxMemberSchema>, MailboxMember> = true
const _memberInput: Mutual<z.infer<typeof MailboxMemberInputSchema>, MailboxMemberInput> = true
const _memberPage: Mutual<z.infer<typeof MailboxMemberPageSchema>, MailboxMemberPage> = true
const _membershipResult: Mutual<z.infer<typeof MailboxMembershipResultSchema>, MailboxMembershipResult> = true
const _searchPage: Mutual<z.infer<typeof SearchPageSchema>, SearchPage> = true
// Referenced once so the pins are not unused bindings (same convention as contract.test.ts).
void [
  _cdError,
  _draft,
  _draftSaveInput,
  _draftSaveResult,
  _draftResponse,
  _draftSummary,
  _draftPage,
  _draftOperation,
  _draftOperationResponse,
  _readState,
  _readStateInput,
  _assignment,
  _assignmentInput,
  _note,
  _noteInput,
  _noteResponse,
  _notePage,
  _capabilities,
  _member,
  _memberInput,
  _memberPage,
  _membershipResult,
  _searchPage,
]

interface CdExample {
  schema: string
  status: number
  body: unknown
}
interface CdRequest {
  schema: string
  value: unknown
}
const cdExamples = fixtures.cd_examples as Record<string, CdExample>
const cdRequests = fixtures.cd_requests as Record<string, CdRequest>

/** Response/error schemas by the component name each example cites in its `schema` reference. */
const RESPONSE_SCHEMAS: Record<string, z.ZodType> = {
  MailboxPage: MailboxPageSchema,
  CollaborationError: CollaborationErrorSchema,
  DraftSaveResult: DraftSaveResultSchema,
  DraftResponse: DraftResponseSchema,
  DraftPage: DraftPageSchema,
  DraftOperationResponse: DraftOperationResponseSchema,
  ThreadReadState: ThreadReadStateSchema,
  ThreadAssignment: ThreadAssignmentSchema,
  ThreadNoteResponse: ThreadNoteResponseSchema,
  ThreadNotePage: ThreadNotePageSchema,
  MailboxMemberPage: MailboxMemberPageSchema,
  MailboxMembershipResult: MailboxMembershipResultSchema,
  SearchPage: SearchPageSchema,
}
const INPUT_SCHEMAS: Record<string, z.ZodType> = {
  DraftSaveInput: DraftSaveInputSchema,
  ThreadReadStateInput: ThreadReadStateInputSchema,
  ThreadAssignmentInput: ThreadAssignmentInputSchema,
  ThreadNoteInput: ThreadNoteInputSchema,
  MailboxMemberInput: MailboxMemberInputSchema,
}
const schemaName = (reference: string): string => reference.slice(reference.lastIndexOf('/') + 1)
const issuesOf = (schema: z.ZodType, value: unknown): unknown[] => {
  const result = schema.safeParse(value)
  return result.success ? [] : result.error.issues
}
const accepts = (schema: z.ZodType, value: unknown): boolean => schema.safeParse(value).success
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const exampleBody = <T>(name: string): T => clone(cdExamples[name]!.body as T)
const requestValue = <T>(name: string): T => clone(cdRequests[name]!.value as T)
/** Copy without one key, for "required field missing" cases on closed schemas. */
function omitKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)) as Omit<T, K>
}
/** Unicode White_Space members by code point, so no editor or tool can mangle the escapes. */
const WS = {
  tab: String.fromCodePoint(0x0009),
  lineFeed: String.fromCodePoint(0x000a),
  verticalTab: String.fromCodePoint(0x000b),
  formFeed: String.fromCodePoint(0x000c),
  carriageReturn: String.fromCodePoint(0x000d),
  nextLine: String.fromCodePoint(0x0085),
  noBreak: String.fromCodePoint(0x00a0),
  lineSeparator: String.fromCodePoint(0x2028),
  narrowNoBreak: String.fromCodePoint(0x202f),
  mathSpace: String.fromCodePoint(0x205f),
  ideographic: String.fromCodePoint(0x3000),
} as const
/** Astral characters: one code point, two UTF-16 units, four UTF-8 bytes. */
const astral = (count: number): string => '\u{1F4E8}'.repeat(count)

const ID = {
  mailbox: '00000000-0000-4000-8000-000000000023',
  draft: '00000000-0000-4000-8000-000000000051',
  operation: '00000000-0000-4000-8000-000000000061',
} as const

describe('canonical C/D examples validate against the schema each one names', () => {
  it('maps every cited response schema', () => {
    const cited = new Set(Object.values(cdExamples).map((example) => schemaName(example.schema)))
    for (const name of cited) expect(RESPONSE_SCHEMAS[name], `no runtime schema for ${name}`).toBeDefined()
  })

  it.each(Object.entries(cdExamples))('cd_examples.%s', (_name, example) => {
    expect(issuesOf(RESPONSE_SCHEMAS[schemaName(example.schema)]!, example.body)).toEqual([])
  })

  it.each(Object.entries(cdRequests))('cd_requests.%s', (_name, request) => {
    const schema = INPUT_SCHEMAS[schemaName(request.schema)]
    expect(schema, `no input schema for ${request.schema}`).toBeDefined()
    expect(issuesOf(schema!, request.value)).toEqual([])
  })

  it('error examples carry a failure status, a collaboration code and the fixed 404 wording', () => {
    const errors = Object.entries(cdExamples).filter(([, example]) => schemaName(example.schema) === 'CollaborationError')
    expect(errors.length).toBeGreaterThanOrEqual(13)
    for (const [name, example] of errors) {
      const body = example.body as CollaborationError
      expect(example.status, name).toBeGreaterThanOrEqual(400)
      expect(COLLABORATION_ERROR_CODES, name).toContain(body.code)
      expect(body.code, name).toBe(name)
      if (example.status === 404) expect(body.message).toBe('This item is unavailable.')
    }
    // The five new codes are all 409 conflicts (contract §3).
    for (const code of ['draft_conflict', 'operation_mismatch', 'draft_consumed', 'assignment_conflict', 'membership_conflict']) {
      expect(cdExamples[code]?.status, code).toBe(409)
    }
  })

  it('the operation examples cover conflict, expired and unknown outcomes through the discriminated union', () => {
    const operations = Object.entries(cdExamples)
      .filter(([, example]) => schemaName(example.schema) === 'DraftOperationResponse')
      .map(([, example]) => (example.body as DraftOperationResponse).operation)
    const outcomes = new Set(operations.map((operation) => operation.outcome))
    expect(outcomes).toContain('conflict')
    expect(outcomes).toContain('expired')
    expect(outcomes).toContain('unknown')
    for (const operation of operations) expect(DraftOperationSchema.parse(operation).outcome).toBe(operation.outcome)
  })
})

describe('C/D code-point and count bounds', () => {
  it('note bodies hold 1..4096 code points, counted in code points', () => {
    const input = requestValue<ThreadNoteInput>('note_create')
    expect(accepts(ThreadNoteInputSchema, { ...input, body_text: astral(4096) })).toBe(true)
    expect(accepts(ThreadNoteInputSchema, { ...input, body_text: astral(4097) })).toBe(false)
    expect(accepts(ThreadNoteInputSchema, { ...input, body_text: '' })).toBe(false)
    const note = exampleBody<ThreadNoteResponse>('note_created').note
    expect(accepts(ThreadNoteSchema, { ...note, body_text: astral(4096) })).toBe(true)
    expect(accepts(ThreadNoteSchema, { ...note, body_text: astral(4097) })).toBe(false)
    // Notes are immutable: version is always the literal 1.
    expect(accepts(ThreadNoteSchema, { ...note, version: 2 })).toBe(false)
  })

  it('search text holds 1..256 code points and is never whitespace-only', () => {
    expect(accepts(SearchQuerySchema, { q: astral(256) })).toBe(true)
    expect(accepts(SearchQuerySchema, { q: astral(257) })).toBe(false)
    expect(accepts(SearchQuerySchema, { q: '' })).toBe(false)
    expect(accepts(SearchQuerySchema, { q: ' \t\n　 ' })).toBe(false)
    // Every ASCII control member of White_Space, alone and together; U+000B is the lint-sensitive one.
    for (const member of Object.values(WS)) expect(accepts(SearchQuerySchema, { q: member }), JSON.stringify(member)).toBe(false)
    expect(accepts(SearchQuerySchema, { q: Object.values(WS).join('') })).toBe(false)
    expect(accepts(SearchQuerySchema, { q: `${WS.verticalTab}a${WS.formFeed}` })).toBe(true)
    expect(accepts(SearchQuerySchema, { q: ' a ' })).toBe(true)
    expect(accepts(SearchQuerySchema, { q: '%_*', mailbox_id: ID.mailbox })).toBe(true)
    expect(accepts(SearchQuerySchema, { q: 'x', mailbox_id: 'not-a-uuid' })).toBe(false)
    expect(accepts(SearchQuerySchema, { q: 'x', limit: 10 })).toBe(false)
    const page = exampleBody<SearchPage>('search_literal_plaintext')
    expect(accepts(SearchPageSchema, { ...page, mailbox_id: null })).toBe(true)
    expect(accepts(SearchPageSchema, { ...page, items: Array.from({ length: 51 }, () => page.items[0]) })).toBe(false)
  })

  it('draft saves bound subject, body and recipients in code points and counts', () => {
    const input = requestValue<DraftSaveInput>('draft_save_plaintext_b')
    expect(accepts(DraftSaveInputSchema, { ...input, subject: astral(998) })).toBe(true)
    expect(accepts(DraftSaveInputSchema, { ...input, subject: astral(999) })).toBe(false)
    expect(accepts(DraftSaveInputSchema, { ...input, body_text: astral(65536) })).toBe(true)
    expect(accepts(DraftSaveInputSchema, { ...input, body_text: astral(65537) })).toBe(false)
    const recipient = { display_name: null, address: 'r@example.test' }
    expect(accepts(DraftSaveInputSchema, { ...input, to: Array.from({ length: 100 }, () => recipient) })).toBe(true)
    expect(accepts(DraftSaveInputSchema, { ...input, to: Array.from({ length: 101 }, () => recipient) })).toBe(false)
    // Empty unsent content is valid; a missing field or an extra one is not (closed schema).
    expect(accepts(DraftSaveInputSchema, { ...input, subject: '', to: [], body_text: '', reply_to_thread_id: null })).toBe(true)
    expect(accepts(DraftSaveInputSchema, omitKey(input, 'reply_to_thread_id'))).toBe(false)
    expect(accepts(DraftSaveInputSchema, { ...input, html: '<b>' })).toBe(false)
  })

  it('resource versions are integers 0..2^31-1 and a stored draft is never at version 0', () => {
    const input = requestValue<DraftSaveInput>('draft_save_plaintext_b')
    expect(accepts(DraftSaveInputSchema, { ...input, expected_version: 0 })).toBe(true)
    expect(accepts(DraftSaveInputSchema, { ...input, expected_version: 2147483647 })).toBe(true)
    expect(accepts(DraftSaveInputSchema, { ...input, expected_version: 2147483648 })).toBe(false)
    expect(accepts(DraftSaveInputSchema, { ...input, expected_version: -1 })).toBe(false)
    expect(accepts(DraftSaveInputSchema, { ...input, expected_version: 1.5 })).toBe(false)
    const draft = exampleBody<DraftResponse>('draft_current_after_b').draft
    expect(accepts(DraftSchema, { ...draft, version: 0 })).toBe(false)
    expect(accepts(DraftSchema, { ...draft, state: 'sent' })).toBe(false)
    const result = exampleBody<DraftSaveResult>('draft_create_applied')
    expect(accepts(DraftSaveResultSchema, { ...result, state: 'consumed' })).toBe(false)
    expect(accepts(MembershipDeleteQuerySchema, { expected_membership_version: 0 })).toBe(true)
    expect(accepts(MembershipDeleteQuerySchema, { expected_membership_version: -1 })).toBe(false)
    const assignment = requestValue<ThreadAssignmentInput>('assignment_clear')
    expect(accepts(ThreadAssignmentInputSchema, { ...assignment, assignee_id: null })).toBe(true)
    expect(accepts(ThreadAssignmentInputSchema, omitKey(assignment, 'expected_assignment_version'))).toBe(false)
  })

  it('draft operations are a closed union keyed by outcome', () => {
    const binding = { operation_id: ID.operation, mailbox_id: ID.mailbox, draft_id: ID.draft }
    const applied = { ...binding, outcome: 'applied', expected_version: 0, version: 1, state: 'editable', recorded_at: '2026-10-13T00:00:00Z', detail_expires_at: '2026-10-20T00:00:00Z' }
    expect(accepts(DraftOperationSchema, applied)).toBe(true)
    expect(accepts(DraftOperationSchema, { ...applied, outcome: 'pending' })).toBe(false)
    expect(accepts(DraftOperationSchema, omitKey(applied, 'version'))).toBe(false)
    expect(accepts(DraftOperationSchema, { ...binding, outcome: 'expired' })).toBe(true)
    expect(accepts(DraftOperationSchema, { ...binding, outcome: 'expired', version: 1 })).toBe(false)
    expect(accepts(DraftOperationSchema, { ...binding, outcome: 'unknown' })).toBe(true)
    const conflict = { ...binding, outcome: 'conflict', code: 'draft_conflict', expected_version: 1, current_version: 2, state: null, recorded_at: '2026-10-13T00:00:00Z', detail_expires_at: '2026-10-20T00:00:00Z' }
    expect(accepts(DraftOperationSchema, conflict)).toBe(true)
    expect(accepts(DraftOperationSchema, { ...conflict, code: 'operation_mismatch' })).toBe(false)
  })

  it('membership payloads are closed and the roster page is bounded', () => {
    const input = requestValue<MailboxMemberInput>('member_add_reader')
    expect(accepts(MailboxMemberInputSchema, input)).toBe(true)
    expect(accepts(MailboxMemberInputSchema, { ...input, capabilities: { compose: true, approve_send: false } })).toBe(false)
    expect(accepts(MailboxMemberInputSchema, { ...input, capabilities: { ...input.capabilities, read: true } })).toBe(false)
    const page = exampleBody<MailboxMemberPage>('members')
    expect(accepts(MailboxMemberPageSchema, { ...page, items: Array.from({ length: 51 }, () => page.items[0]) })).toBe(false)
    const deleted = exampleBody<MailboxMembershipResult>('membership_deleted')
    expect(deleted.member).toBeNull()
    expect(accepts(MailboxMembershipResultSchema, { ...deleted, member: undefined })).toBe(false)
  })

  it('collaboration errors accept every code and bound message and request id', () => {
    const error = exampleBody<CollaborationError>('draft_conflict')
    for (const code of COLLABORATION_ERROR_CODES) expect(accepts(CollaborationErrorSchema, { ...error, code })).toBe(true)
    expect(accepts(CollaborationErrorSchema, { ...error, code: 'send_failed' })).toBe(false)
    expect(accepts(CollaborationErrorSchema, { ...error, message: astral(256) })).toBe(true)
    expect(accepts(CollaborationErrorSchema, { ...error, message: astral(257) })).toBe(false)
    expect(accepts(CollaborationErrorSchema, { ...error, request_id: 'r'.repeat(128) })).toBe(true)
    expect(accepts(CollaborationErrorSchema, { ...error, request_id: 'r'.repeat(129) })).toBe(false)
    expect(accepts(CollaborationErrorSchema, { ...error, retry_after: 30 })).toBe(false)
  })
})
