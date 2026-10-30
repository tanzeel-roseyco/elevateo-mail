// BE-02 C/D: the HTTP gateway maps each collaboration operation to its exact route, method,
// proof/context headers, query string and body; validates inputs before dispatch so nothing out
// of bound leaves the browser; parses the wider CollaborationError on C/D routes only; and tells
// a 201 create from a 200 replay. Real Rails conformance is the validator's container run.
import { describe, expect, it, vi } from 'vitest'
import fixtures from '../../../../contracts/v1/fixtures.json'
import type { CollaborationError, DraftOperationResponse, DraftSaveInput, MailboxMemberInput, ThreadAssignmentInput, ThreadNoteInput, ThreadReadStateInput } from './contract'
import { CD_FIXTURE as CD } from './fixtures/collaborationState'
import type { CsrfProof, ReadContext } from './gateway'
import { createHttpGateway } from './http/httpGateway'
import type { FetchLike } from './http/transport'

interface CdExample {
  schema: string
  status: number
  body: unknown
}
const cdExamples = fixtures.cd_examples as Record<string, CdExample>
const cdRequests = fixtures.cd_requests as Record<string, { schema: string; value: unknown }>
const body = (name: string): unknown => cdExamples[name]!.body
const requestValue = <T>(name: string): T => cdRequests[name]!.value as T

const CTX: ReadContext = { contextId: 'context_A_0123456789', authorizationVersion: 'authz_CD_0123456789' }
const PROOF: CsrfProof = { csrfToken: 'fixture_cd_csrf_0123456789' }
const OP_B = '00000000-0000-4000-8000-000000000062'

interface Captured {
  path: string
  init: RequestInit
}

/** HTTP gateway over a fetch that records every request and answers with one canned response. */
function recording(status: number, payload: unknown, headers: Record<string, string> = {}) {
  const calls: Captured[] = []
  const gateway = createHttpGateway(async (path, init) => {
    calls.push({ path, init })
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...headers } })
  })
  return { gateway, calls, last: () => calls[calls.length - 1]! }
}
const headersOf = (c: Captured) => c.init.headers as Record<string, string>
const sentBody = (c: Captured): unknown => JSON.parse(c.init.body as string)

function expectContextRead(c: Captured) {
  expect(c.init.method).toBe('GET')
  expect(headersOf(c)['X-Session-Context']).toBe(CTX.contextId)
  expect(headersOf(c)['X-Authorization-Version']).toBe(CTX.authorizationVersion)
  expect(headersOf(c)['X-CSRF-Token']).toBeUndefined()
  expect(headersOf(c)['Content-Type']).toBeUndefined()
  expect(c.init.body).toBeUndefined()
}

function expectProofWrite(c: Captured, method: 'PUT' | 'POST') {
  expect(c.init.method).toBe(method)
  expect(headersOf(c)['X-Session-Context']).toBe(CTX.contextId)
  expect(headersOf(c)['X-Authorization-Version']).toBe(CTX.authorizationVersion)
  expect(headersOf(c)['X-CSRF-Token']).toBe(PROOF.csrfToken)
  expect(headersOf(c)['Content-Type']).toBe('application/json')
  // Origin is browser-set; the client never spoofs it.
  expect(headersOf(c)['Origin']).toBeUndefined()
}

describe('C: drafts over the HTTP gateway', () => {
  it('GET /v1/drafts/{draft_id}?mailbox_id reads with context headers only', async () => {
    const { gateway, last } = recording(200, body('draft_current_after_b'))
    const result = await gateway.getDraft(CTX, CD.draftId, CD.mailboxId)
    expect(result.draft.id).toBe(CD.draftId)
    expect(last().path).toBe(`/v1/drafts/${CD.draftId}?mailbox_id=${CD.mailboxId}`)
    expectContextRead(last())
  })

  it('PUT /v1/drafts/{draft_id} sends the proof and exactly the validated save input', async () => {
    const input = requestValue<DraftSaveInput>('draft_save_plaintext_b')
    const { gateway, last } = recording(200, body('draft_save_b_applied'))
    const result = await gateway.saveDraft(CTX, PROOF, CD.draftId, input)
    expect(result).toMatchObject({ draft_id: CD.draftId, operation_id: OP_B, state: 'editable' })
    expect(last().path).toBe(`/v1/drafts/${CD.draftId}`)
    expectProofWrite(last(), 'PUT')
    expect(sentBody(last())).toEqual(input)
  })

  it('GET /v1/drafts?mailbox_id lists summaries and forwards the cursor', async () => {
    const { gateway, last } = recording(200, body('draft_summaries'))
    const page = await gateway.listDrafts(CTX, CD.mailboxId, { cursor: 'c1', limit: 10 })
    expect(page.mailbox_id).toBe(CD.mailboxId)
    expect(last().path).toBe(`/v1/drafts?mailbox_id=${CD.mailboxId}&cursor=c1&limit=10`)
    expectContextRead(last())
  })

  it.each(['operation_a_after_b_or_consumption', 'operation_conflict', 'operation_missing_draft_conflict', 'operation_consumed_conflict', 'operation_expired', 'operation_unknown'])(
    'GET /v1/draft-operations/{operation_id}?mailbox_id&draft_id parses %s',
    async (name) => {
      const expected = (body(name) as DraftOperationResponse).operation
      const { gateway, last } = recording(200, body(name))
      const result = await gateway.getDraftOperation(CTX, expected.operation_id, CD.mailboxId, CD.draftId)
      expect(result.operation).toEqual(expected)
      expect(last().path).toBe(`/v1/draft-operations/${expected.operation_id}?mailbox_id=${CD.mailboxId}&draft_id=${CD.draftId}`)
      expectContextRead(last())
    },
  )

  it('path segments are encoded, so an id can never escape its route', async () => {
    const { gateway, last } = recording(200, body('draft_current_after_b'))
    await gateway.getDraft(CTX, '../session', CD.mailboxId)
    expect(last().path.startsWith('/v1/drafts/..%2Fsession?')).toBe(true)
  })
})

describe('D: read state, assignment, notes, membership and search over the HTTP gateway', () => {
  it('PUT /v1/threads/{id}/read-state sends the desired boolean with the proof', async () => {
    const input = requestValue<ThreadReadStateInput>('read_true')
    const { gateway, last } = recording(200, body('read_state_read'))
    const result = await gateway.setThreadReadState(CTX, PROOF, CD.threadId, input)
    expect(result.read).toBe(true)
    expect(last().path).toBe(`/v1/threads/${CD.threadId}/read-state`)
    expectProofWrite(last(), 'PUT')
    expect(sentBody(last())).toEqual(input)
  })

  it('GET and PUT /v1/threads/{id}/assignment carry the mailbox and the expected revision', async () => {
    const read = recording(200, body('assignment_initial'))
    const initial = await read.gateway.getThreadAssignment(CTX, CD.threadId, CD.mailboxId)
    expect(initial.assignee_id).toBeNull()
    expect(read.last().path).toBe(`/v1/threads/${CD.threadId}/assignment?mailbox_id=${CD.mailboxId}`)
    expectContextRead(read.last())

    const set = requestValue<ThreadAssignmentInput>('assignment_set')
    const write = recording(200, body('assignment_set'))
    const assigned = await write.gateway.setThreadAssignment(CTX, PROOF, CD.threadId, set)
    expect(assigned.assignee_id).toBe(set.assignee_id)
    expect(write.last().path).toBe(`/v1/threads/${CD.threadId}/assignment`)
    expectProofWrite(write.last(), 'PUT')
    expect(sentBody(write.last())).toEqual(set)

    const clear = requestValue<ThreadAssignmentInput>('assignment_clear')
    const cleared = recording(200, body('assignment_cleared'))
    await cleared.gateway.setThreadAssignment(CTX, PROOF, CD.threadId, clear)
    expect(sentBody(cleared.last())).toEqual(clear)
    expect((sentBody(cleared.last()) as ThreadAssignmentInput).assignee_id).toBeNull()
  })

  it('GET /v1/threads/{id}/notes?mailbox_id lists notes with context headers only', async () => {
    const { gateway, last } = recording(200, body('notes'))
    const page = await gateway.listThreadNotes(CTX, CD.threadId, CD.mailboxId, {})
    expect(page.thread_id).toBe(CD.threadId)
    expect(last().path).toBe(`/v1/threads/${CD.threadId}/notes?mailbox_id=${CD.mailboxId}`)
    expectContextRead(last())
  })

  it('POST /v1/threads/{id}/notes sends the hostile plaintext verbatim; 201 is new, 200 is a replay', async () => {
    const input = requestValue<ThreadNoteInput>('note_create')
    const created = recording(201, body('note_created'))
    const first = await created.gateway.createThreadNote(CTX, PROOF, CD.threadId, input)
    expect(first.replayed).toBe(false)
    expect(first.response.note.id).toBe(input.note_id)
    expect(created.last().path).toBe(`/v1/threads/${CD.threadId}/notes`)
    expectProofWrite(created.last(), 'POST')
    expect(sentBody(created.last())).toEqual(input)
    expect((sentBody(created.last()) as ThreadNoteInput).body_text).toContain('<img src=')

    const replayed = recording(200, body('note_replayed'))
    const second = await replayed.gateway.createThreadNote(CTX, PROOF, CD.threadId, input)
    expect(second.replayed).toBe(true)
    expect(second.response.note.id).toBe(input.note_id)
  })

  it('GET /v1/mailboxes/{id}/members pages the roster with its mailbox-wide revision', async () => {
    const { gateway, last } = recording(200, body('members'))
    const page = await gateway.listMailboxMembers(CTX, CD.mailboxId, { cursor: 'm1' })
    expect(page.membership_version).toBe(1)
    expect(last().path).toBe(`/v1/mailboxes/${CD.mailboxId}/members?cursor=m1`)
    expectContextRead(last())
  })

  it('PUT /v1/mailboxes/{id}/members/{user_id} sends the revision and all three flags', async () => {
    const input = requestValue<MailboxMemberInput>('member_add_reader')
    const { gateway, last } = recording(200, body('membership_added'))
    const result = await gateway.putMailboxMember(CTX, PROOF, CD.mailboxId, CD.readerId, input)
    expect(result.user_id).toBe(CD.readerId)
    expect(last().path).toBe(`/v1/mailboxes/${CD.mailboxId}/members/${CD.readerId}`)
    expectProofWrite(last(), 'PUT')
    expect(sentBody(last())).toEqual(input)
  })

  it('DELETE /v1/mailboxes/{id}/members/{user_id} carries the revision as its only query, no body, with the proof', async () => {
    const { gateway, last } = recording(200, body('membership_deleted'))
    const result = await gateway.deleteMailboxMember(CTX, PROOF, CD.mailboxId, CD.readerId, 2)
    expect(result.member).toBeNull()
    expect(last().path).toBe(`/v1/mailboxes/${CD.mailboxId}/members/${CD.readerId}?expected_membership_version=2`)
    expect(last().init.method).toBe('DELETE')
    expect(last().init.body).toBeUndefined()
    expect(headersOf(last())['Content-Type']).toBeUndefined()
    expect(headersOf(last())['X-CSRF-Token']).toBe(PROOF.csrfToken)
    expect(headersOf(last())['X-Session-Context']).toBe(CTX.contextId)
    expect(headersOf(last())['X-Authorization-Version']).toBe(CTX.authorizationVersion)
  })

  it('GET /v1/search encodes the literal query and omits an absent mailbox scope', async () => {
    const scoped = recording(200, body('search_literal_plaintext'))
    const page = await scoped.gateway.searchMail(CTX, { q: '<img', mailbox_id: CD.mailboxId })
    expect(page.q).toBe('<img')
    expect(scoped.last().path).toBe(`/v1/search?q=%3Cimg&mailbox_id=${CD.mailboxId}`)
    expectContextRead(scoped.last())

    const unscoped = recording(200, body('search_empty'))
    await unscoped.gateway.searchMail(CTX, { q: 'a b', cursor: 's1', limit: 20 })
    expect(unscoped.last().path).toBe('/v1/search?q=a+b&cursor=s1&limit=20')
  })
})

describe('browser-side validation refuses out-of-bound C/D input before any fetch', () => {
  const cases: ReadonlyArray<[string, (gateway: ReturnType<typeof createHttpGateway>) => Promise<unknown>]> = [
    ['saveDraft with a negative expected version', (g) => g.saveDraft(CTX, PROOF, CD.draftId, { ...requestValue<DraftSaveInput>('draft_save_plaintext_b'), expected_version: -1 })],
    ['saveDraft with 999 subject code points', (g) => g.saveDraft(CTX, PROOF, CD.draftId, { ...requestValue<DraftSaveInput>('draft_save_plaintext_b'), subject: 'x'.repeat(999) })],
    ['createThreadNote with an empty body', (g) => g.createThreadNote(CTX, PROOF, CD.threadId, { ...requestValue<ThreadNoteInput>('note_create'), body_text: '' })],
    ['createThreadNote with 4097 code points', (g) => g.createThreadNote(CTX, PROOF, CD.threadId, { ...requestValue<ThreadNoteInput>('note_create'), body_text: '\u{1F4E8}'.repeat(4097) })],
    ['setThreadAssignment with a fractional revision', (g) => g.setThreadAssignment(CTX, PROOF, CD.threadId, { mailbox_id: CD.mailboxId, assignee_id: null, expected_assignment_version: 1.5 })],
    ['putMailboxMember with a missing flag', (g) => g.putMailboxMember(CTX, PROOF, CD.mailboxId, CD.readerId, { expected_membership_version: 1, capabilities: { compose: true, approve_send: false } } as unknown as MailboxMemberInput)],
    ['deleteMailboxMember with a negative revision', (g) => g.deleteMailboxMember(CTX, PROOF, CD.mailboxId, CD.readerId, -1)],
    ['searchMail with a whitespace-only query', (g) => g.searchMail(CTX, { q: ' 　 ' })],
    ['searchMail with 257 code points', (g) => g.searchMail(CTX, { q: '\u{1F4E8}'.repeat(257) })],
  ]

  it.each(cases)('%s rejects as malformed without a request', async (_name, call) => {
    const fetchImpl = vi.fn<FetchLike>()
    await expect(call(createHttpGateway(fetchImpl))).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('error envelopes', () => {
  const errorNames = Object.entries(cdExamples)
    .filter(([, example]) => example.status >= 400)
    .map(([name]) => name)

  it.each(errorNames)('%s on a C/D route becomes an api GatewayError with code, status and request id', async (name) => {
    const example = cdExamples[name]!
    const envelope = example.body as CollaborationError
    const { gateway } = recording(example.status, example.body)
    await expect(gateway.saveDraft(CTX, PROOF, CD.draftId, requestValue<DraftSaveInput>('draft_save_plaintext_b'))).rejects.toMatchObject({
      kind: 'api',
      code: envelope.code,
      status: example.status,
      requestId: envelope.request_id,
      message: envelope.message,
    })
  })

  it('the 404 wording is the fixed non-revealing sentence', async () => {
    const { gateway } = recording(404, body('not_available'))
    await expect(gateway.getThreadAssignment(CTX, CD.threadId, CD.mailboxId)).rejects.toMatchObject({ code: 'not_available', message: 'This item is unavailable.' })
  })

  it('a whole-seconds Retry-After within 1..300 is surfaced; anything else is dropped', async () => {
    const held = recording(503, body('temporarily_unavailable'), { 'Retry-After': '30' })
    await expect(held.gateway.setThreadReadState(CTX, PROOF, CD.threadId, { mailbox_id: CD.mailboxId, read: true })).rejects.toMatchObject({ code: 'temporarily_unavailable', retryAfterSeconds: 30 })
    const tooLong = recording(429, body('rate_limited'), { 'Retry-After': '301' })
    const error = await tooLong.gateway.setThreadReadState(CTX, PROOF, CD.threadId, { mailbox_id: CD.mailboxId, read: true }).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'rate_limited' })
    expect((error as { retryAfterSeconds?: number }).retryAfterSeconds).toBeUndefined()
  })

  it('A/B routes keep the narrow Error enum: a collaboration code there is a malformed response', async () => {
    const { gateway } = recording(409, body('draft_conflict'))
    await expect(gateway.listMailboxes(CTX, {})).rejects.toMatchObject({ kind: 'transport', code: 'malformed', status: 409 })
  })

  it('a success body of the wrong shape is malformed, never partially accepted', async () => {
    const { gateway } = recording(200, body('search_literal_plaintext'))
    await expect(gateway.getDraft(CTX, CD.draftId, CD.mailboxId)).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
    const extra = recording(200, { ...(body('read_state_read') as object), html: '<b>' })
    await expect(extra.gateway.setThreadReadState(CTX, PROOF, CD.threadId, { mailbox_id: CD.mailboxId, read: true })).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })
})
