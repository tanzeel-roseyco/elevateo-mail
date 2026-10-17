import { createDraftAttachmentGateway } from '../draftAttachmentGateway'
import { SendReviewSchema, SendApprovalInputSchema, ApprovalResultSchema, SendStatusSchema, SendCancellationInputSchema, CancellationResultSchema, SendErrorSchema } from '../sendContract'
// HTTP adapter for the MailroomGateway port. Routes, headers and byte budgets follow
// contracts/v1/openapi.json 1.0.0-collaboration.1; every response and error is validated by the
// transport before the UI sees it. Fixture code is never imported from this module graph.
import type { z } from 'zod'
import {
  AcceptInputSchema,
  AuthAcceptedSchema,
  AuthChallengeSchema,
  AuthLifecycleSchema,
  AuthLogoutSchema,
  CD_MAX_BYTES,
  CD_MAX_REQUEST_BYTES,
  CollaborationErrorSchema,
  DraftOperationResponseSchema,
  DraftPageSchema,
  DraftResponseSchema,
  DraftSaveInputSchema,
  DraftSaveResultSchema,
  LoginInputSchema,
  LogoutInputSchema,
  MailboxMemberInputSchema,
  MailboxMemberPageSchema,
  MailboxMembershipResultSchema,
  MailboxPageSchema,
  MAX_BYTES,
  MembershipDeleteQuerySchema,
  OrganizationInputSchema,
  OrganizationPageSchema,
  RecoveryInputSchema,
  SearchPageSchema,
  SearchQuerySchema,
  SessionSchema,
  ThreadAssignmentInputSchema,
  ThreadAssignmentSchema,
  ThreadDetailPageSchema,
  ThreadNoteInputSchema,
  ThreadNotePageSchema,
  ThreadNoteResponseSchema,
  ThreadPageSchema,
  ThreadReadStateInputSchema,
  ThreadReadStateSchema,
} from '../contract'
import { GatewayError } from '../errors'
import type { CsrfProof, MailroomGateway, PageQuery, ReadContext, ThreadFilter } from '../gateway'
import { requestJson, requestJsonWithStatus, type FetchLike, type RequestOptions } from './transport'

function contextHeaders(ctx: ReadContext): Record<string, string> {
  return { 'X-Session-Context': ctx.contextId, 'X-Authorization-Version': ctx.authorizationVersion }
}

// AIDEV-NOTE: The proof travels only as X-CSRF-Token. Origin is a forbidden header the browser
// sets itself; the server rejects a wrong one with 400 request_invalid (contract README).
function proofHeaders(proof: CsrfProof): Record<string, string> {
  return { 'X-CSRF-Token': proof.csrfToken }
}

/**
 * Browser-side input validation: a malformed value never leaves the device and is never logged.
 * AIDEV-NOTE: Callers are `async` so this throw becomes a rejection; the port promises a Promise.
 */
function validated<S extends z.ZodType>(schema: S, input: z.input<S>): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) throw new GatewayError('transport', 'malformed', 'The entered values are not acceptable.')
  return result.data
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value))
  const encoded = search.toString()
  return encoded === '' ? '' : `?${encoded}`
}

const seg = encodeURIComponent

/** Production gateway. Fixture code must never be imported from this module graph. */
export function createHttpGateway(fetchImpl?: FetchLike): MailroomGateway {
  const base = fetchImpl === undefined ? {} : { fetchImpl }
  // AIDEV-NOTE: C/D routes parse the wider CollaborationError; A/B and lifecycle keep Error.
  const cd = (ctx: ReadContext, extra: Partial<RequestOptions> = {}): RequestOptions => ({
    ...base,
    errorSchema: CollaborationErrorSchema,
    ...extra,
    headers: { ...contextHeaders(ctx), ...extra.headers },
  })
  const cdWrite = (ctx: ReadContext, proof: CsrfProof, body: unknown, method: 'PUT' | 'POST', maxRequestBytes: number, signal: AbortSignal | undefined): RequestOptions =>
    cd(ctx, { headers: proofHeaders(proof), body, method, maxRequestBytes, signal })

  return {
    draftAttachments: createDraftAttachmentGateway(fetchImpl),
    getSession(signal) {
      return requestJson('/v1/session', SessionSchema, MAX_BYTES.session, { ...base, signal })
    },
    listMailboxes(ctx, q: PageQuery, signal) {
      return requestJson(`/v1/mailboxes${query({ cursor: q.cursor, limit: q.limit })}`, MailboxPageSchema, MAX_BYTES.mailboxes, { ...base, headers: contextHeaders(ctx), signal })
    },
    listThreads(ctx, mailboxId, q: PageQuery & { filter?: ThreadFilter }, signal) {
      return requestJson(
        `/v1/mailboxes/${seg(mailboxId)}/threads${query({ cursor: q.cursor, limit: q.limit, filter: q.filter })}`,
        ThreadPageSchema,
        MAX_BYTES.threads,
        { ...base, headers: contextHeaders(ctx), signal },
      )
    },
    getThread(ctx, threadId, mailboxId, q: PageQuery, signal) {
      return requestJson(
        `/v1/threads/${seg(threadId)}${query({ mailbox_id: mailboxId, cursor: q.cursor, limit: q.limit })}`,
        ThreadDetailPageSchema,
        MAX_BYTES.thread,
        { ...base, headers: contextHeaders(ctx), signal },
      )
    },

    // --- BE-02A session lifecycle ---------------------------------------------------------
    getLoginChallenge(signal) {
      return requestJson('/v1/auth/login-challenge', AuthChallengeSchema, MAX_BYTES.challenge, { ...base, signal })
    },
    async login(proof, input, signal) {
      const body = validated(LoginInputSchema, input)
      return requestJson('/v1/auth/login', AuthLifecycleSchema, MAX_BYTES.lifecycle, { ...base, headers: proofHeaders(proof), body, signal })
    },
    async requestRecovery(proof, input, signal) {
      const body = validated(RecoveryInputSchema, input)
      return requestJson('/v1/auth/recovery', AuthAcceptedSchema, MAX_BYTES.accepted, { ...base, headers: proofHeaders(proof), body, signal })
    },
    async acceptAuthEntry(proof, input, signal) {
      const body = validated(AcceptInputSchema, input)
      return requestJson('/v1/auth/accept', AuthLifecycleSchema, MAX_BYTES.lifecycle, { ...base, headers: proofHeaders(proof), body, signal })
    },
    refreshSession(proof, signal) {
      return requestJson('/v1/auth/refresh', AuthLifecycleSchema, MAX_BYTES.lifecycle, { ...base, headers: proofHeaders(proof), body: {}, signal })
    },
    async logout(proof, input, signal) {
      const body = validated(LogoutInputSchema, input)
      return requestJson('/v1/auth/logout', AuthLogoutSchema, MAX_BYTES.logout, { ...base, headers: proofHeaders(proof), body, signal })
    },
    listOrganizations(ctx, q: PageQuery, signal) {
      return requestJson(`/v1/organizations${query({ cursor: q.cursor, limit: q.limit })}`, OrganizationPageSchema, MAX_BYTES.organizations, { ...base, headers: contextHeaders(ctx), signal })
    },
    async switchOrganization(ctx, proof, input, signal) {
      const body = validated(OrganizationInputSchema, input)
      return requestJson('/v1/session/organization', AuthLifecycleSchema, MAX_BYTES.lifecycle, {
        ...base,
        headers: { ...contextHeaders(ctx), ...proofHeaders(proof) },
        body,
        signal,
      })
    },

    // --- BE-02 C: drafts -----------------------------------------------------------------
    getDraft(ctx, draftId, mailboxId, signal) {
      return requestJson(`/v1/drafts/${seg(draftId)}${query({ mailbox_id: mailboxId })}`, DraftResponseSchema, CD_MAX_BYTES.draft, cd(ctx, { signal }))
    },
    async saveDraft(ctx, proof, draftId, input, signal) {
      const body = validated(DraftSaveInputSchema, input)
      return requestJson(`/v1/drafts/${seg(draftId)}`, DraftSaveResultSchema, CD_MAX_BYTES.draftSave, cdWrite(ctx, proof, body, 'PUT', CD_MAX_REQUEST_BYTES.draftSave, signal))
    },
    listDrafts(ctx, mailboxId, q: PageQuery, signal) {
      return requestJson(`/v1/drafts${query({ mailbox_id: mailboxId, cursor: q.cursor, limit: q.limit })}`, DraftPageSchema, CD_MAX_BYTES.drafts, cd(ctx, { signal }))
    },
    getDraftOperation(ctx, operationId, mailboxId, draftId, signal) {
      return requestJson(
        `/v1/draft-operations/${seg(operationId)}${query({ mailbox_id: mailboxId, draft_id: draftId })}`,
        DraftOperationResponseSchema,
        CD_MAX_BYTES.operation,
        cd(ctx, { signal }),
      )
    },

    getSendReview(ctx, draftId, mailboxId, signal) {
      return requestJson(`/v1/drafts/${seg(draftId)}/send-review${query({ mailbox_id: mailboxId })}`, SendReviewSchema, 2_097_152, cd(ctx, { errorSchema: SendErrorSchema, signal }))
    },
    async approveDraftSend(ctx, proof, draftId, input, signal) {
      const body = validated(SendApprovalInputSchema, input)
      return requestJson(`/v1/drafts/${seg(draftId)}/send-approvals`, ApprovalResultSchema, 16_384, cd(ctx, { errorSchema: SendErrorSchema, headers: proofHeaders(proof), body, method: 'POST', maxRequestBytes: 4096, signal }))
    },
    getSendStatus(ctx, sendId, mailboxId, signal) {
      return requestJson(`/v1/send-intents/${seg(sendId)}${query({ mailbox_id: mailboxId })}`, SendStatusSchema, 16_384, cd(ctx, { errorSchema: SendErrorSchema, signal }))
    },
    async cancelSend(ctx, proof, sendId, input, signal) {
      const body = validated(SendCancellationInputSchema, input)
      return requestJson(`/v1/send-intents/${seg(sendId)}/cancellation`, CancellationResultSchema, 16_384, cd(ctx, { errorSchema: SendErrorSchema, headers: proofHeaders(proof), body, method: 'POST', maxRequestBytes: 4096, signal }))
    },

    // --- BE-02 D: read state, assignment, notes, membership, search ------------------------
    async setThreadReadState(ctx, proof, threadId, input, signal) {
      const body = validated(ThreadReadStateInputSchema, input)
      return requestJson(`/v1/threads/${seg(threadId)}/read-state`, ThreadReadStateSchema, CD_MAX_BYTES.readState, cdWrite(ctx, proof, body, 'PUT', CD_MAX_REQUEST_BYTES.small, signal))
    },
    getThreadAssignment(ctx, threadId, mailboxId, signal) {
      return requestJson(`/v1/threads/${seg(threadId)}/assignment${query({ mailbox_id: mailboxId })}`, ThreadAssignmentSchema, CD_MAX_BYTES.assignment, cd(ctx, { signal }))
    },
    async setThreadAssignment(ctx, proof, threadId, input, signal) {
      const body = validated(ThreadAssignmentInputSchema, input)
      return requestJson(`/v1/threads/${seg(threadId)}/assignment`, ThreadAssignmentSchema, CD_MAX_BYTES.assignment, cdWrite(ctx, proof, body, 'PUT', CD_MAX_REQUEST_BYTES.small, signal))
    },
    listThreadNotes(ctx, threadId, mailboxId, q: PageQuery, signal) {
      return requestJson(
        `/v1/threads/${seg(threadId)}/notes${query({ mailbox_id: mailboxId, cursor: q.cursor, limit: q.limit })}`,
        ThreadNotePageSchema,
        CD_MAX_BYTES.notes,
        cd(ctx, { signal }),
      )
    },
    async createThreadNote(ctx, proof, threadId, input, signal) {
      const body = validated(ThreadNoteInputSchema, input)
      const result = await requestJsonWithStatus(`/v1/threads/${seg(threadId)}/notes`, ThreadNoteResponseSchema, CD_MAX_BYTES.note, cdWrite(ctx, proof, body, 'POST', CD_MAX_REQUEST_BYTES.note, signal))
      // 201 is a fresh immutable note; 200 is the original note replayed for an identical retry.
      return { response: result.data, replayed: result.status !== 201 }
    },
    listMailboxMembers(ctx, mailboxId, q: PageQuery, signal) {
      return requestJson(`/v1/mailboxes/${seg(mailboxId)}/members${query({ cursor: q.cursor, limit: q.limit })}`, MailboxMemberPageSchema, CD_MAX_BYTES.members, cd(ctx, { signal }))
    },
    async putMailboxMember(ctx, proof, mailboxId, userId, input, signal) {
      const body = validated(MailboxMemberInputSchema, input)
      return requestJson(
        `/v1/mailboxes/${seg(mailboxId)}/members/${seg(userId)}`,
        MailboxMembershipResultSchema,
        CD_MAX_BYTES.membership,
        cdWrite(ctx, proof, body, 'PUT', CD_MAX_REQUEST_BYTES.small, signal),
      )
    },
    async deleteMailboxMember(ctx, proof, mailboxId, userId, expectedMembershipVersion, signal) {
      const q = validated(MembershipDeleteQuerySchema, { expected_membership_version: expectedMembershipVersion })
      // DELETE has no body; the revision is its single query parameter and the proof still travels.
      return requestJson(
        `/v1/mailboxes/${seg(mailboxId)}/members/${seg(userId)}${query({ expected_membership_version: q.expected_membership_version })}`,
        MailboxMembershipResultSchema,
        CD_MAX_BYTES.membership,
        cd(ctx, { method: 'DELETE', headers: proofHeaders(proof), signal }),
      )
    },
    async searchMail(ctx, q, signal) {
      const { q: text, mailbox_id } = validated(SearchQuerySchema, { q: q.q, ...(q.mailbox_id === undefined ? {} : { mailbox_id: q.mailbox_id }) })
      return requestJson(`/v1/search${query({ q: text, mailbox_id, cursor: q.cursor, limit: q.limit })}`, SearchPageSchema, CD_MAX_BYTES.search, cd(ctx, { signal }))
    },
  }
}
