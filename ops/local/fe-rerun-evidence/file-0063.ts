// Pure draft-save operation lifecycle (BE-02 C, be02-cd-contract.md §4–§5, D05 amendment). No
// React, no store, no transport. The UI feeds it gateway outcomes and renders what it returns.
//
// Invariants this module guarantees:
// - A save attempt is identified by ONE operation id bound to ONE frozen payload; retrying an
//   uncertain attempt resends exactly that pair, never a re-keyed or re-serialized one.
// - A conflict never overwrites: the buffer stays local until the person chooses to reload the
//   server copy or to rebase (which is deliberate new intent and therefore a fresh operation id).
// - "unknown" from a lookup means no visible record, never "not performed"; it keeps the attempt.
// - An expired operation id is permanently unusable; only a fresh id can carry the content again.
// - A refused REPLAY (400/404 on the retry request) says nothing about the earlier invocation:
//   the attempt stays unresolved. Only a first, never-acknowledged request is "rejected".
// - A receipt is applied only when its binding (operation, mailbox, draft, expected version)
//   matches the attempt; a schema-valid receipt for another binding proves nothing here.
import type { DraftOperation, DraftSaveInput, DraftSaveResult } from '@/data/contract'
import { GatewayError, isUncertainWriteOutcome } from '@/data/errors'

/** Editable content of a draft as the person sees it; identical shape to the wire payload fields. */
export interface DraftContent {
  subject: string
  to: Array<{ display_name: string | null; address: string | null }>
  body_text: string
  reply_to_thread_id: string | null
}

/** One save attempt: the exact payload that was (or will be) sent under this operation id. */
export interface SaveAttempt {
  operationId: string
  payload: Readonly<DraftSaveInput>
}

export type RefusalCode = 'request_invalid' | 'not_available'

export type SaveStatus =
  /** Nothing in flight and nothing unresolved; `savedVersion` is the last version this client knows the server holds. */
  | { kind: 'idle' }
  /** `replay` marks a resend of an unresolved attempt: its refusal must not be read as "nothing saved". */
  | { kind: 'saving'; attempt: SaveAttempt; replay: boolean }
  /** Server answered definitively that the version moved on or the draft is consumed. */
  | { kind: 'conflict'; attempt: SaveAttempt; code: 'draft_conflict' | 'draft_consumed'; currentVersion: number | null }
  /** Operation id reused with different content/binding, or expired: this id can never carry a save again. */
  | { kind: 'unusable'; attempt: SaveAttempt; reason: 'mismatch' | 'expired' }
  /**
   * No definitive answer about this attempt (timeout, 429, 503, 500, network, lost ownership) or a
   * replay that was refused before the ledger could answer (`refusal`): it may or may not have committed.
   */
  | { kind: 'uncertain'; attempt: SaveAttempt; message: string; retryAfterSeconds: number | null; refusal: RefusalCode | null }
  /** Definitive non-conflict refusal of a FIRST request (400 request_invalid, 404 not_available) — the content was not stored. */
  | { kind: 'rejected'; attempt: SaveAttempt; code: RefusalCode | 'other'; message: string }

export interface DraftBuffer {
  draftId: string
  mailboxId: string
  content: DraftContent
  /** Version the server is known to hold for this draft (0 = not created yet). */
  savedVersion: number
  /** Content as of `savedVersion`; used to tell "dirty" from "clean". */
  savedContent: DraftContent
  status: SaveStatus
}

export function newDraftBuffer(draftId: string, mailboxId: string, content: DraftContent, savedVersion = 0): DraftBuffer {
  return { draftId, mailboxId, content, savedVersion, savedContent: content, status: { kind: 'idle' } }
}

export function isDirty(buffer: DraftBuffer): boolean {
  return JSON.stringify(buffer.content) !== JSON.stringify(buffer.savedContent)
}

/** True while an attempt is unresolved or in flight: the buffer must outlive any single screen. */
export function hasUnresolvedAttempt(buffer: DraftBuffer): boolean {
  return buffer.status.kind !== 'idle' && buffer.status.kind !== 'rejected'
}

/** The frozen attempt an exact retry would resend, or null when the next save is a fresh one. */
export function pendingReplay(buffer: DraftBuffer): SaveAttempt | null {
  return buffer.status.kind === 'uncertain' ? buffer.status.attempt : null
}

/** Edits are allowed unless an attempt is in flight; an unresolved attempt keeps its own frozen payload. */
export function edit(buffer: DraftBuffer, content: DraftContent): DraftBuffer {
  if (buffer.status.kind === 'saving') return buffer
  return { ...buffer, content }
}

/**
 * Start a save. With an unresolved attempt present (uncertain), the SAME attempt is resent as a
 * replay (exact id + payload, independent of later edits); otherwise a new operation id captures
 * the current content at the known saved version. Conflicts and unusable ids never auto-rebase.
 */
export function beginSave(buffer: DraftBuffer, newOperationId: () => string): { buffer: DraftBuffer; attempt: SaveAttempt } | { buffer: DraftBuffer; attempt: null } {
  const status = buffer.status
  if (status.kind === 'saving' || status.kind === 'conflict' || status.kind === 'unusable') return { buffer, attempt: null }
  if (status.kind === 'uncertain') {
    return { buffer: { ...buffer, status: { kind: 'saving', attempt: status.attempt, replay: true } }, attempt: status.attempt }
  }
  const operationId = newOperationId()
  const attempt: SaveAttempt = {
    operationId,
    // The operation id is part of the payload on the wire; bind it once here.
    payload: Object.freeze({
      mailbox_id: buffer.mailboxId,
      operation_id: operationId,
      expected_version: buffer.savedVersion,
      subject: buffer.content.subject,
      to: buffer.content.to.map((a) => ({ ...a })),
      body_text: buffer.content.body_text,
      reply_to_thread_id: buffer.content.reply_to_thread_id,
    }),
  }
  return { buffer: { ...buffer, status: { kind: 'saving', attempt, replay: false } }, attempt }
}

function contentOf(payload: DraftSaveInput): DraftContent {
  return { subject: payload.subject, to: payload.to.map((a) => ({ ...a })), body_text: payload.body_text, reply_to_thread_id: payload.reply_to_thread_id }
}

/**
 * A save result is coupled to its attempt only when it names the same draft and operation and
 * reports a version after the expected one; anything else is a receipt for something else.
 */
export function resultBinding(buffer: DraftBuffer, attempt: SaveAttempt, result: DraftSaveResult): 'bound' | 'mismatch' {
  if (result.operation_id !== attempt.operationId || result.draft_id !== buffer.draftId) return 'mismatch'
  if (result.version <= attempt.payload.expected_version) return 'mismatch'
  return 'bound'
}

/**
 * A ledger record proves this attempt's outcome only under the attempt's full binding: operation,
 * mailbox and draft always; expected version too for the detailed applied/conflict records; and an
 * applied record must report a version AFTER the ORIGINAL attempt's expected version (CORE-01) —
 * the same advancement rule `resultBinding` enforces on direct save results.
 */
export function receiptBinding(buffer: DraftBuffer, attempt: SaveAttempt, operation: DraftOperation): 'bound' | 'mismatch' {
  if (operation.operation_id !== attempt.operationId) return 'mismatch'
  if (operation.mailbox_id !== attempt.payload.mailbox_id || operation.draft_id !== buffer.draftId) return 'mismatch'
  if ((operation.outcome === 'applied' || operation.outcome === 'conflict') && operation.expected_version !== attempt.payload.expected_version) return 'mismatch'
  // Compare against the attempt's own expected version, not the buffer's possibly-newer saved
  // version: a valid receipt for this attempt may precede a later operation (CORE-01).
  if (operation.outcome === 'applied' && operation.version <= attempt.payload.expected_version) return 'mismatch'
  return 'bound'
}

const LOST_REPLY = 'The save was not confirmed. Your text is kept here; it may or may not have been stored.'
const REFUSED_REPLAY = 'The server refused this retry request. That says nothing about the earlier attempt, which stays unresolved; your text is kept here.'
const MISMATCHED_RECEIPT = 'The server answered with a receipt for a different draft or version. Nothing was applied; this attempt stays unresolved and your text is kept here.'

/**
 * Apply a successful save result for the attempt in flight. A result for another attempt is
 * ignored; a result that names this attempt but is bound elsewhere is a protocol failure, so the
 * attempt becomes uncertain (bounded, visible) instead of a fake success.
 */
export function applySaved(buffer: DraftBuffer, attempt: SaveAttempt, result: DraftSaveResult): DraftBuffer {
  if (buffer.status.kind !== 'saving' || buffer.status.attempt.operationId !== attempt.operationId) return buffer
  if (resultBinding(buffer, attempt, result) === 'mismatch') {
    return { ...buffer, status: { kind: 'uncertain', attempt, message: MISMATCHED_RECEIPT, retryAfterSeconds: null, refusal: null } }
  }
  return { ...buffer, savedVersion: result.version, savedContent: contentOf(attempt.payload), status: { kind: 'idle' } }
}

/** Classify a failed save for the attempt in flight. Stale failures are ignored. */
export function applySaveFailure(buffer: DraftBuffer, attempt: SaveAttempt, error: unknown): DraftBuffer {
  const status = buffer.status
  if (status.kind !== 'saving' || status.attempt.operationId !== attempt.operationId) return buffer
  if (error instanceof GatewayError && error.kind === 'api') {
    switch (error.code) {
      case 'draft_conflict':
      case 'draft_consumed':
        return { ...buffer, status: { kind: 'conflict', attempt, code: error.code, currentVersion: null } }
      case 'operation_mismatch':
        return { ...buffer, status: { kind: 'unusable', attempt, reason: 'mismatch' } }
      case 'request_invalid':
      case 'not_available':
        // Authorization and proof checks precede ledger replay: a refused REPLAY cannot prove the
        // first invocation was not stored (D05). Only a first request is definitively rejected.
        if (status.replay) return { ...buffer, status: { kind: 'uncertain', attempt, message: REFUSED_REPLAY, retryAfterSeconds: null, refusal: error.code } }
        return {
          ...buffer,
          status: {
            kind: 'rejected',
            attempt,
            code: error.code,
            message: error.code === 'request_invalid' ? 'The draft was not accepted by the server. Nothing was saved.' : 'This draft or mailbox is unavailable to you now. Nothing was saved.',
          },
        }
      default:
        break
    }
  }
  if (isUncertainWriteOutcome(error)) {
    const retry = error instanceof GatewayError && error.retryAfterSeconds !== undefined ? error.retryAfterSeconds : null
    return { ...buffer, status: { kind: 'uncertain', attempt, message: LOST_REPLY, retryAfterSeconds: retry, refusal: null } }
  }
  if (status.replay) return { ...buffer, status: { kind: 'uncertain', attempt, message: REFUSED_REPLAY, retryAfterSeconds: null, refusal: null } }
  return { ...buffer, status: { kind: 'rejected', attempt, code: 'other', message: 'The save could not be completed. Nothing was saved.' } }
}

/**
 * Reconcile an uncertain attempt with the ledger lookup for its operation id. `unknown` keeps the
 * attempt unresolved (a save may still be in flight server-side); `expired` makes the id unusable.
 * A record under another binding is ignored here; callers surface it via `receiptBinding`.
 */
export function reconcile(buffer: DraftBuffer, attempt: SaveAttempt, operation: DraftOperation): DraftBuffer {
  if (buffer.status.kind !== 'uncertain' || buffer.status.attempt.operationId !== attempt.operationId) return buffer
  if (receiptBinding(buffer, attempt, operation) === 'mismatch') return buffer
  switch (operation.outcome) {
    case 'applied':
      return { ...buffer, savedVersion: operation.version, savedContent: contentOf(attempt.payload), status: { kind: 'idle' } }
    case 'conflict':
      return { ...buffer, status: { kind: 'conflict', attempt, code: operation.code, currentVersion: operation.current_version } }
    case 'expired':
      return { ...buffer, status: { kind: 'unusable', attempt, reason: 'expired' } }
    case 'unknown':
      return buffer
  }
}

/**
 * Deliberate new intent after a conflict or an unusable id, taken only after a SUCCESSFUL current
 * authorized read: keep the local text, adopt the server's observed version as the base, and clear
 * the attempt so the next save gets a fresh id. Nothing here fetches, and an unavailable or expired
 * outcome alone never reaches this transition (D05).
 */
export function rebase(buffer: DraftBuffer, currentVersion: number, serverContent: DraftContent): DraftBuffer {
  if (buffer.status.kind === 'saving') return buffer
  return { ...buffer, savedVersion: currentVersion, savedContent: serverContent, status: { kind: 'idle' } }
}

/** Discard local edits in favour of a successfully read server copy (the other way out of a conflict). */
export function adoptServerCopy(buffer: DraftBuffer, currentVersion: number, serverContent: DraftContent): DraftBuffer {
  if (buffer.status.kind === 'saving') return buffer
  return { ...buffer, content: serverContent, savedVersion: currentVersion, savedContent: serverContent, status: { kind: 'idle' } }
}

/** After a definitive first-request rejection the attempt is over; the text stays for correction. */
export function dismissRejection(buffer: DraftBuffer): DraftBuffer {
  if (buffer.status.kind !== 'rejected') return buffer
  return { ...buffer, status: { kind: 'idle' } }
}
