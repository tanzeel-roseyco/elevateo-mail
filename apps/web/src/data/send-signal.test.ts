import { describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from './fixtures/fixtureGateway'
import type { MailroomGateway } from './gateway'
import { createHttpGateway } from './http/httpGateway'
import type { FetchLike } from './http/transport'
import { APPROVAL, REVIEW, STATUS } from '@/features/send/sendTestData'

const ctx = { contextId: REVIEW.context_id, authorizationVersion: REVIEW.authorization_version }
const proof = { csrfToken: 'synthetic_send_csrf_012345' }
const input = { mailbox_id: REVIEW.mailbox_id, operation_id: APPROVAL.send_id, expected_version: 1, review_digest: APPROVAL.review_digest, correspondence_confirmed: true as const }
const methods: Array<[string, (g: MailroomGateway, signal: AbortSignal) => Promise<unknown>]> = [
  ['review', (g, signal) => g.getSendReview(ctx, REVIEW.draft_id, REVIEW.mailbox_id, signal)],
  ['approval', (g, signal) => g.approveDraftSend(ctx, proof, REVIEW.draft_id, input, signal)],
  ['status', (g, signal) => g.getSendStatus(ctx, STATUS.send_id, STATUS.mailbox_id, signal)],
  ['cancellation', (g, signal) => g.cancelSend(ctx, proof, STATUS.send_id, { mailbox_id: STATUS.mailbox_id }, signal)],
]
describe('BE03 gateway signal parity', () => {
  it.each(methods)('fixture %s respects pre-abort before its unavailable response', async (_name, call) => {
    const controller = new AbortController(); controller.abort()
    await expect(call(createFixtureGateway(), controller.signal)).rejects.toMatchObject({ kind: 'transport', code: 'aborted' })
  })
  it.each(methods)('fixture %s never invents an approval/status when its signal is live', async (_name, call) => {
    await expect(call(createFixtureGateway(), new AbortController().signal)).rejects.toMatchObject({ kind: 'api', code: 'temporarily_unavailable', status: 503 })
  })
  it.each(methods)('HTTP %s links mid-flight caller abort to fetch', async (_name, call) => {
    let inner: AbortSignal | null | undefined
    const fetcher = vi.fn<FetchLike>((_path, init) => { inner = init.signal; return new Promise<never>(() => {}) })
    const controller = new AbortController()
    const pending = call(createHttpGateway(fetcher), controller.signal).catch((error: unknown) => error)
    expect(inner?.aborted).toBe(false)
    controller.abort()
    expect(await pending).toMatchObject({ kind: 'transport', code: 'aborted' })
    expect(inner?.aborted).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
