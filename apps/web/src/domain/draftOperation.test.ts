// Pure draft-save lifecycle (BE-02 C §4–§5, D05): one operation id binds one frozen payload; an
// uncertain attempt is retried as exactly that pair; conflicts never overwrite and never
// auto-rebase; "unknown" keeps the attempt; "expired" makes the id unusable; a refused REPLAY
// keeps the attempt unresolved; receipts apply only under the attempt's full binding; stale
// results are ignored. No React, no transport.
import { describe, expect, it } from 'vitest'
import type { DraftOperation, DraftSaveResult } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import {
  adoptServerCopy,
  applySaved,
  applySaveFailure,
  beginSave,
  dismissRejection,
  edit,
  hasUnresolvedAttempt,
  isDirty,
  newDraftBuffer,
  pendingReplay,
  rebase,
  receiptBinding,
  reconcile,
  resultBinding,
  type DraftBuffer,
  type DraftContent,
  type SaveAttempt,
} from './draftOperation'

const DRAFT = '00000000-0000-4000-8000-000000000051'
const MAILBOX = '00000000-0000-4000-8000-000000000023'
const OPS = ['00000000-0000-4000-8000-000000000081', '00000000-0000-4000-8000-000000000082', '00000000-0000-4000-8000-000000000083']
const content = (body = 'hello'): DraftContent => ({ subject: 'S', to: [{ display_name: 'R', address: 'r@example.test' }], body_text: body, reply_to_thread_id: null })
const api = (code: GatewayError['code'], status: number, retryAfterSeconds?: number) =>
  new GatewayError('api', code, 'synthetic', { status, requestId: 'r1', ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) })
const transport = (code: GatewayError['code'], status?: number) => new GatewayError('transport', code, 'synthetic', status === undefined ? {} : { status })

/** Deterministic id source: hands out OPS in order and counts calls. */
function ids() {
  let next = 0
  return { newId: () => OPS[next++]!, count: () => next }
}

/** Buffer at `savedVersion` with an attempt in flight, plus the attempt itself. */
function saving(savedVersion = 2, body = 'edited'): { buffer: DraftBuffer; attempt: SaveAttempt } {
  const base = edit(newDraftBuffer(DRAFT, MAILBOX, content(), savedVersion), content(body))
  const begun = beginSave(base, ids().newId)
  if (begun.attempt === null) throw new Error('expected an attempt')
  return begun
}

// Canonical ledger records, each built field by field for its own union member: a spread from
// another variant would smuggle foreign fields past the discriminant and fail strict typing.
// `applied` returns the narrowed 'applied' member (not the whole union) so tests may spread it
// and override same-variant fields (e.g. a non-advancing version) without widening to a union.
const applied = (operationId: string, version: number): Extract<DraftOperation, { outcome: 'applied' }> => ({
  operation_id: operationId,
  mailbox_id: MAILBOX,
  draft_id: DRAFT,
  outcome: 'applied',
  expected_version: version - 1,
  version,
  state: 'editable',
  recorded_at: '2026-10-13T00:03:00Z',
  detail_expires_at: '2026-10-20T00:03:00Z',
})
const conflict = (operationId: string, code: 'draft_conflict' | 'draft_consumed', expectedVersion: number, currentVersion: number): DraftOperation => ({
  operation_id: operationId,
  mailbox_id: MAILBOX,
  draft_id: DRAFT,
  outcome: 'conflict',
  code,
  expected_version: expectedVersion,
  current_version: currentVersion,
  state: code === 'draft_consumed' ? 'consumed' : 'editable',
  recorded_at: '2026-10-13T00:03:00Z',
  detail_expires_at: '2026-10-20T00:03:00Z',
})

describe('beginSave', () => {
  it('mints one operation id and freezes the payload at the known saved version', () => {
    const source = ids()
    const buffer = edit(newDraftBuffer(DRAFT, MAILBOX, content(), 2), content('edited'))
    expect(isDirty(buffer)).toBe(true)
    const begun = beginSave(buffer, source.newId)
    expect(begun.attempt).not.toBeNull()
    const attempt = begun.attempt!
    expect(attempt.operationId).toBe(OPS[0])
    expect(attempt.payload).toEqual({ mailbox_id: MAILBOX, operation_id: OPS[0], expected_version: 2, subject: 'S', to: content().to, body_text: 'edited', reply_to_thread_id: null })
    expect(Object.isFrozen(attempt.payload)).toBe(true)
    expect(begun.buffer.status).toEqual({ kind: 'saving', attempt, replay: false })
    // Edits during the flight are refused: the frozen payload stays the single source of the attempt.
    expect(edit(begun.buffer, content('later')).content.body_text).toBe('edited')
  })

  it('resends the same attempt after an uncertain outcome instead of minting a new id', () => {
    const source = ids()
    const first = beginSave(edit(newDraftBuffer(DRAFT, MAILBOX, content(), 2), content('edited')), source.newId)
    const uncertain = applySaveFailure(first.buffer, first.attempt!, api('temporarily_unavailable', 503, 9))
    expect(uncertain.status).toMatchObject({ kind: 'uncertain', retryAfterSeconds: 9 })
    // A later local edit does not re-key the pending attempt.
    const edited = edit(uncertain, content('typed more'))
    expect(pendingReplay(edited)).toBe(first.attempt)
    expect(hasUnresolvedAttempt(edited)).toBe(true)
    const retry = beginSave(edited, source.newId)
    expect(retry.attempt).toBe(first.attempt)
    expect(retry.attempt!.payload).toBe(first.attempt!.payload)
    expect(retry.buffer.status).toEqual({ kind: 'saving', attempt: first.attempt, replay: true })
    expect(source.count()).toBe(1)
    expect(edited.content.body_text).toBe('typed more')
    // The replay is independent of the newer local text: the frozen payload still says "edited".
    expect(retry.attempt!.payload.body_text).toBe('edited')
  })

  it('refuses to start while saving, in conflict or with an unusable id', () => {
    const { buffer, attempt } = saving()
    expect(beginSave(buffer, ids().newId).attempt).toBeNull()
    expect(beginSave(applySaveFailure(buffer, attempt, api('draft_conflict', 409)), ids().newId).attempt).toBeNull()
    expect(beginSave(applySaveFailure(buffer, attempt, api('operation_mismatch', 409)), ids().newId).attempt).toBeNull()
  })
})

describe('applySaved and applySaveFailure', () => {
  it('a bound result advances the saved version and content; a late result for a settled attempt is ignored', () => {
    const { buffer, attempt } = saving()
    const result: DraftSaveResult = { draft_id: DRAFT, operation_id: attempt.operationId, version: 3, state: 'editable' }
    expect(resultBinding(buffer, attempt, result)).toBe('bound')
    const saved = applySaved(buffer, attempt, result)
    expect(saved.savedVersion).toBe(3)
    expect(saved.savedContent.body_text).toBe('edited')
    expect(saved.status).toEqual({ kind: 'idle' })
    expect(isDirty(saved)).toBe(false)
    const stale = applySaved(saved, attempt, result)
    expect(stale).toBe(saved)
    const otherAttempt: SaveAttempt = { operationId: OPS[2]!, payload: attempt.payload }
    expect(applySaved(buffer, otherAttempt, result)).toBe(buffer)
  })

  it.each([
    ['another operation id', { operation_id: OPS[2]! }],
    ['another draft', { draft_id: '00000000-0000-4000-8000-000000000052' }],
    ['a version not after the expected one', { version: 2 }],
  ] as const)('a schema-valid save result bound to %s never counts as success: the attempt turns uncertain', (_name, patch) => {
    const { buffer, attempt } = saving()
    const result: DraftSaveResult = { draft_id: DRAFT, operation_id: attempt.operationId, version: 3, state: 'editable', ...patch }
    expect(resultBinding(buffer, attempt, result)).toBe('mismatch')
    const next = applySaved(buffer, attempt, result)
    expect(next.status).toMatchObject({ kind: 'uncertain', attempt, refusal: null })
    expect(next.status.kind === 'uncertain' && next.status.message).toMatch(/different draft or version/)
    expect(next.savedVersion).toBe(2)
    expect(next.savedContent.body_text).toBe('hello')
    expect(next.content.body_text).toBe('edited')
    // The attempt is still the one an exact retry would resend.
    expect(pendingReplay(next)).toBe(attempt)
  })

  it.each([
    ['409 draft_conflict', api('draft_conflict', 409), { kind: 'conflict', code: 'draft_conflict', currentVersion: null }],
    ['409 draft_consumed', api('draft_consumed', 409), { kind: 'conflict', code: 'draft_consumed' }],
    ['409 operation_mismatch', api('operation_mismatch', 409), { kind: 'unusable', reason: 'mismatch' }],
    ['400 request_invalid (first request)', api('request_invalid', 400), { kind: 'rejected', code: 'request_invalid' }],
    ['404 not_available (first request)', api('not_available', 404), { kind: 'rejected', code: 'not_available' }],
    ['503 temporarily_unavailable', api('temporarily_unavailable', 503, 30), { kind: 'uncertain', retryAfterSeconds: 30 }],
    ['429 rate_limited', api('rate_limited', 429), { kind: 'uncertain', retryAfterSeconds: null }],
    ['500 internal_error', api('internal_error', 500), { kind: 'uncertain' }],
    ['timeout', transport('timeout'), { kind: 'uncertain' }],
    ['network', transport('network'), { kind: 'uncertain' }],
    ['abort after dispatch', transport('aborted'), { kind: 'uncertain' }],
    ['malformed response (status known)', transport('malformed', 200), { kind: 'uncertain' }],
    ['ownership moved on (no error object)', undefined, { kind: 'uncertain' }],
    ['local malformed input (never sent)', transport('malformed'), { kind: 'rejected', code: 'other' }],
  ] as const)('%s classifies the in-flight attempt', (_name, error, expected) => {
    const { buffer, attempt } = saving()
    const next = applySaveFailure(buffer, attempt, error)
    expect(next.status).toMatchObject({ ...expected, attempt })
    // The local text is never discarded by a failure.
    expect(next.content.body_text).toBe('edited')
    expect(next.savedVersion).toBe(2)
  })

  it.each([
    ['400 request_invalid', api('request_invalid', 400), 'request_invalid'],
    ['404 not_available', api('not_available', 404), 'not_available'],
    ['local malformed input', transport('malformed'), null],
  ] as const)('a REPLAY refused with %s keeps the attempt unresolved instead of reporting "nothing saved" (D05)', (_name, error, refusal) => {
    const source = ids()
    const first = beginSave(edit(newDraftBuffer(DRAFT, MAILBOX, content(), 2), content('edited')), source.newId)
    const attempt = first.attempt!
    const uncertain = applySaveFailure(first.buffer, attempt, transport('timeout'))
    const replay = beginSave(uncertain, source.newId)
    expect(replay.buffer.status).toMatchObject({ kind: 'saving', replay: true })
    const refused = applySaveFailure(replay.buffer, attempt, error)
    expect(refused.status).toMatchObject({ kind: 'uncertain', attempt, refusal, retryAfterSeconds: null })
    expect(refused.status.kind === 'uncertain' && refused.status.message).toMatch(/says nothing about the earlier attempt/)
    expect(refused.status.kind === 'uncertain' && refused.status.message).not.toMatch(/Nothing was saved/)
    expect(refused.content.body_text).toBe('edited')
    expect(refused.savedVersion).toBe(2)
    // History is preserved: the same attempt can still be looked up or resent, under the same id.
    expect(pendingReplay(refused)).toBe(attempt)
    expect(beginSave(refused, source.newId).attempt).toBe(attempt)
    expect(source.count()).toBe(1)
    // A first, never-acknowledged request with the same refusal is definitively rejected.
    const fresh = beginSave(edit(newDraftBuffer(DRAFT, MAILBOX, content(), 2), content('edited')), ids().newId)
    const rejected = applySaveFailure(fresh.buffer, fresh.attempt!, error)
    expect(rejected.status.kind).toBe('rejected')
    expect(hasUnresolvedAttempt(rejected)).toBe(false)
  })

  it('a failure for another attempt is ignored', () => {
    const { buffer } = saving()
    const other: SaveAttempt = { operationId: OPS[2]!, payload: buffer.status.kind === 'saving' ? buffer.status.attempt.payload : (undefined as never) }
    expect(applySaveFailure(buffer, other, api('draft_conflict', 409))).toBe(buffer)
  })
})

describe('reconcile (ledger lookup for an uncertain attempt)', () => {
  function uncertain() {
    const { buffer, attempt } = saving()
    return { buffer: applySaveFailure(buffer, attempt, transport('timeout')), attempt }
  }

  it('applied resolves the attempt as saved at the recorded version', () => {
    const { buffer, attempt } = uncertain()
    const next = reconcile(buffer, attempt, applied(attempt.operationId, 3))
    expect(next.status).toEqual({ kind: 'idle' })
    expect(next.savedVersion).toBe(3)
    expect(next.savedContent.body_text).toBe('edited')
  })

  it('conflict surfaces the recorded code and current version without touching the text', () => {
    const { buffer, attempt } = uncertain()
    const next = reconcile(buffer, attempt, conflict(attempt.operationId, 'draft_conflict', 2, 4))
    expect(next.status).toMatchObject({ kind: 'conflict', code: 'draft_conflict', currentVersion: 4 })
    expect(next.content.body_text).toBe('edited')
    expect(next.savedVersion).toBe(2)
    const consumed = reconcile(buffer, attempt, conflict(attempt.operationId, 'draft_consumed', 2, 2))
    expect(consumed.status).toMatchObject({ kind: 'conflict', code: 'draft_consumed', currentVersion: 2 })
  })

  it.each([
    ['mailbox_id', { mailbox_id: '00000000-0000-4000-8000-000000000024' }],
    ['draft_id', { draft_id: '00000000-0000-4000-8000-000000000052' }],
    ['expected_version', { expected_version: 1 }],
  ] as const)('an applied or conflict record whose %s differs is a mismatched receipt: nothing applied, attempt kept', (_name, patch) => {
    const { buffer, attempt } = uncertain()
    const appliedRecord: DraftOperation = { ...applied(attempt.operationId, 3), ...patch }
    const conflictRecord: DraftOperation = { ...conflict(attempt.operationId, 'draft_conflict', 2, 4), ...patch }
    expect(receiptBinding(buffer, attempt, appliedRecord)).toBe('mismatch')
    expect(receiptBinding(buffer, attempt, conflictRecord)).toBe('mismatch')
    expect(reconcile(buffer, attempt, appliedRecord)).toBe(buffer)
    expect(reconcile(buffer, attempt, conflictRecord)).toBe(buffer)
    expect(buffer.status).toMatchObject({ kind: 'uncertain', attempt })
    expect(buffer.savedVersion).toBe(2)
    expect(buffer.savedContent.body_text).toBe('hello')
    // Exact same-id records with the attempt's binding still resolve.
    expect(receiptBinding(buffer, attempt, applied(attempt.operationId, 3))).toBe('bound')
    expect(receiptBinding(buffer, attempt, conflict(attempt.operationId, 'draft_conflict', 2, 4))).toBe('bound')
  })

  it.each([
    ['equal to the expected version', 2],
    ['below the expected version', 1],
  ] as const)('an applied receipt whose version is %s never discharges the attempt (CORE-01)', (_name, version) => {
    const { buffer, attempt } = uncertain()
    // Otherwise fully bound receipt: same operation/mailbox/draft/expected_version, but a saved
    // version that does not advance past the ORIGINAL attempt's expected version 2.
    const nonAdvancing: DraftOperation = { ...applied(attempt.operationId, 3), expected_version: 2, version }
    expect(receiptBinding(buffer, attempt, nonAdvancing)).toBe('mismatch')
    const next = reconcile(buffer, attempt, nonAdvancing)
    expect(next).toBe(buffer)
    expect(next.status).toMatchObject({ kind: 'uncertain', attempt })
    expect(next.savedVersion).toBe(2)
    expect(next.savedContent.body_text).toBe('hello')
    expect(next.content.body_text).toBe('edited')
    // Replay after the rejected receipt still resends the ORIGINAL attempt: same id, same frozen
    // payload, no fresh operation id minted.
    expect(pendingReplay(next)).toBe(attempt)
    const source = ids()
    const retry = beginSave(next, source.newId)
    expect(retry.attempt).toBe(attempt)
    expect(retry.attempt!.payload).toBe(attempt.payload)
    expect(source.count()).toBe(0)
  })

  it('a validly advancing receipt resolves the attempt while later local edits stay dirty (CORE-01)', () => {
    const { buffer, attempt } = uncertain()
    const edited = edit(buffer, content('typed after timeout'))
    const next = reconcile(edited, attempt, applied(attempt.operationId, 3))
    expect(next.status).toEqual({ kind: 'idle' })
    expect(next.savedVersion).toBe(3)
    // The attempt's ORIGINAL payload is what was acknowledged, not the newer editor text.
    expect(next.savedContent.body_text).toBe('edited')
    expect(next.content.body_text).toBe('typed after timeout')
    expect(isDirty(next)).toBe(true)
  })

  it('expired and unknown records are bound by mailbox and draft (no expected version to compare)', () => {
    const { buffer, attempt } = uncertain()
    const binding = { operation_id: attempt.operationId, mailbox_id: MAILBOX, draft_id: DRAFT }
    expect(receiptBinding(buffer, attempt, { ...binding, outcome: 'expired' })).toBe('bound')
    expect(receiptBinding(buffer, attempt, { ...binding, outcome: 'unknown' })).toBe('bound')
    const elsewhere = { ...binding, draft_id: '00000000-0000-4000-8000-000000000052', outcome: 'expired' } as const
    expect(receiptBinding(buffer, attempt, elsewhere)).toBe('mismatch')
    expect(reconcile(buffer, attempt, elsewhere)).toBe(buffer)
  })

  it('expired makes the id unusable; unknown keeps the attempt pending; a foreign id is ignored', () => {
    const { buffer, attempt } = uncertain()
    const binding = { operation_id: attempt.operationId, mailbox_id: MAILBOX, draft_id: DRAFT }
    expect(reconcile(buffer, attempt, { ...binding, outcome: 'expired' }).status).toMatchObject({ kind: 'unusable', reason: 'expired' })
    expect(reconcile(buffer, attempt, { ...binding, outcome: 'unknown' })).toBe(buffer)
    expect(reconcile(buffer, attempt, { ...binding, operation_id: OPS[2]!, outcome: 'expired' })).toBe(buffer)
    // Only an uncertain attempt is reconciled; an idle buffer ignores late lookups.
    const idle = newDraftBuffer(DRAFT, MAILBOX, content(), 2)
    expect(reconcile(idle, attempt, applied(attempt.operationId, 3))).toBe(idle)
  })
})

describe('ways out of a conflict or an unusable id', () => {
  it('rebase keeps the local text and adopts the server version as the new base', () => {
    const { buffer, attempt } = saving()
    const conflicted = applySaveFailure(buffer, attempt, api('draft_conflict', 409))
    const next = rebase(conflicted, 5, content('server'))
    expect(next.status).toEqual({ kind: 'idle' })
    expect(next.content.body_text).toBe('edited')
    expect(next.savedVersion).toBe(5)
    expect(next.savedContent.body_text).toBe('server')
    expect(isDirty(next)).toBe(true)
    // The next save is a fresh operation against the server version: it is minted from the id
    // source (positioned past OPS[0], which saving() used) instead of reusing the old attempt's id.
    const source = ids()
    source.newId()
    const begun = beginSave(next, source.newId)
    expect(source.count()).toBe(2)
    expect(begun.attempt!.operationId).toBe(OPS[1])
    expect(begun.attempt!.operationId).not.toBe(attempt.operationId)
    expect(begun.attempt!.payload.expected_version).toBe(5)
  })

  it('adoptServerCopy replaces the local text with the server copy and is clean afterwards', () => {
    const { buffer, attempt } = saving()
    const conflicted = applySaveFailure(buffer, attempt, api('draft_consumed', 409))
    const next = adoptServerCopy(conflicted, 5, content('server'))
    expect(next.content.body_text).toBe('server')
    expect(next.savedVersion).toBe(5)
    expect(isDirty(next)).toBe(false)
  })

  it('neither rebase nor adopt interrupts an attempt in flight', () => {
    const { buffer } = saving()
    expect(rebase(buffer, 9, content('x'))).toBe(buffer)
    expect(adoptServerCopy(buffer, 9, content('x'))).toBe(buffer)
  })

  it('dismissRejection returns to idle only from a rejection', () => {
    const { buffer, attempt } = saving()
    const rejected = applySaveFailure(buffer, attempt, api('request_invalid', 400))
    expect(dismissRejection(rejected).status).toEqual({ kind: 'idle' })
    const uncertain = applySaveFailure(buffer, attempt, transport('timeout'))
    expect(dismissRejection(uncertain)).toBe(uncertain)
  })
})
