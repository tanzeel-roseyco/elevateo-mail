import { describe, expect, it, vi } from 'vitest'
import { CollaborationErrorSchema } from './contract'
import { GatewayError } from './errors'
import { createHttpGateway } from './http/httpGateway'
import { APPROVAL, REVIEW, STATUS } from '@/features/send/sendTestData'
import { SendApprovalInputSchema, SendErrorSchema, SendReviewSchema } from './sendContract'

const ctx = { contextId: REVIEW.context_id, authorizationVersion: REVIEW.authorization_version }
const proof = { csrfToken: 'csrf_token_0123456789' }
const input = { mailbox_id: REVIEW.mailbox_id, operation_id: APPROVAL.send_id, expected_version: 1, review_digest: APPROVAL.review_digest, correspondence_confirmed: true as const }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('BE03 send HTTP boundary', () => {
  it('uses the four exact routes and scoped session proofs, preserving signal', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(REVIEW)).mockResolvedValueOnce(response(APPROVAL, 202)).mockResolvedValueOnce(response(STATUS)).mockResolvedValueOnce(response({ context_id: REVIEW.context_id, authorization_version: REVIEW.authorization_version, send_id: APPROVAL.send_id, result: 'cancelled', state: 'cancelled', cancel_requested: true, simulated: true }))
    const g = createHttpGateway(fetcher); const signal = new AbortController().signal
    await g.getSendReview(ctx, REVIEW.draft_id, REVIEW.mailbox_id, signal)
    await g.approveDraftSend(ctx, proof, REVIEW.draft_id, input, signal)
    await g.getSendStatus(ctx, APPROVAL.send_id, REVIEW.mailbox_id, signal)
    await g.cancelSend(ctx, proof, APPROVAL.send_id, { mailbox_id: REVIEW.mailbox_id }, signal)
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      `/v1/drafts/${REVIEW.draft_id}/send-review?mailbox_id=${REVIEW.mailbox_id}`,
      `/v1/drafts/${REVIEW.draft_id}/send-approvals`,
      `/v1/send-intents/${APPROVAL.send_id}?mailbox_id=${REVIEW.mailbox_id}`,
      `/v1/send-intents/${APPROVAL.send_id}/cancellation`,
    ])
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'X-Session-Context': ctx.contextId, 'X-Authorization-Version': ctx.authorizationVersion, 'X-CSRF-Token': proof.csrfToken }, body: JSON.stringify(input), signal: expect.any(AbortSignal) })
  })
  it.each(['review_stale', 'send_not_ready', 'send_terminal', 'dispatch_held'])('parses independent send error %s without widening C/D', async (code) => {
    const body = { code, message: 'Synthetic failure.', request_id: 'test-send-1' }
    expect(CollaborationErrorSchema.safeParse(body).success).toBe(false)
    expect(SendErrorSchema.safeParse(body).success).toBe(true)
    const g = createHttpGateway(async () => response(body, code === 'dispatch_held' ? 503 : 409))
    await expect(g.approveDraftSend(ctx, proof, REVIEW.draft_id, input)).rejects.toMatchObject({ kind: 'api', code })
  })
  it('rejects false attestation, extra fields and invalid binding before network dispatch', async () => {
    const fetcher = vi.fn(); const g = createHttpGateway(fetcher)
    const invalid = { ...input, expected_version: 0 }
    await expect(g.approveDraftSend(ctx, proof, REVIEW.draft_id, invalid)).rejects.toBeInstanceOf(GatewayError)
    expect(SendApprovalInputSchema.safeParse({ ...input, correspondence_confirmed: false }).success).toBe(false)
    expect(SendApprovalInputSchema.safeParse({ ...input, body_text: 'forged' }).success).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('accepts legal Unicode limits and literal empty content and live mode but rejects extra response fields', () => {
    expect(SendReviewSchema.safeParse({ ...REVIEW, subject: '😀'.repeat(998), body_text: '', sender: { display_name: null, address: null } }).success).toBe(true)
    expect(SendReviewSchema.safeParse({ ...REVIEW, subject: '😀'.repeat(999) }).success).toBe(false)
    expect(SendReviewSchema.safeParse({ ...REVIEW, simulated: false }).success).toBe(true)
    expect(SendReviewSchema.safeParse({ ...REVIEW, snapshot_bytes: 'private' }).success).toBe(false)
  })
  it('rejects send status responses over the 16KiB serialized budget', async () => {
    const g = createHttpGateway(async () => response({ ...STATUS, excess: 'x'.repeat(17000) }))
    await expect(g.getSendStatus(ctx, STATUS.send_id, STATUS.mailbox_id)).rejects.toMatchObject({ kind: 'transport', code: 'oversized' })
  })
  it('aborts every new send method before dispatch when caller is already cancelled', async () => {
    const fetcher = vi.fn(); const g = createHttpGateway(fetcher); const controller = new AbortController(); controller.abort()
    for (const call of [() => g.getSendReview(ctx, REVIEW.draft_id, REVIEW.mailbox_id, controller.signal), () => g.approveDraftSend(ctx, proof, REVIEW.draft_id, input, controller.signal), () => g.getSendStatus(ctx, STATUS.send_id, STATUS.mailbox_id, controller.signal), () => g.cancelSend(ctx, proof, STATUS.send_id, { mailbox_id: STATUS.mailbox_id }, controller.signal)]) await expect(call()).rejects.toMatchObject({ code: 'aborted' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
