import { describe, expect, it } from 'vitest'
import { canApprove, canCancel, canReplace, canStartSubmission, checkSendContent, describeServerError, isSettled, MAX_PENDING_KEYS, MAX_POLL_ATTEMPTS, nextPollDelay, pendingKeySchema, recipientCount, SEND_STATUSES, sendStatusView, UNCONFIRMED_VIEW, type SendContent } from './sendLifecycle'

const content = (patch: Partial<SendContent> = {}): SendContent => ({ mailboxId: 'mbx-1', to: ['a@example.com'], cc: [], bcc: [], subject: 'Hello', body: 'Text', ...patch })

describe('send status wording', () => {
  it('gives every status a label and a meaning', () => {
    for (const status of SEND_STATUSES) {
      const view = sendStatusView(status)
      expect(view.label).not.toBe('')
      expect(view.meaning).not.toBe('')
    }
  })

  it('never describes approval as sending or acceptance as delivery', () => {
    expect(sendStatusView('pending').meaning).toContain('Approval is not sending')
    expect(sendStatusView('accepted').meaning).toContain('Acceptance is not delivery')
    expect(sendStatusView('accepted').label).not.toMatch(/deliver|sent/i)
    expect(sendStatusView('unknown').meaning).toContain('Do not send it again')
  })

  it('gives every status, and a submission with no answer, its own label', () => {
    const labels = [...SEND_STATUSES.map((status) => sendStatusView(status).label), UNCONFIRMED_VIEW.label]
    expect(new Set(labels).size).toBe(SEND_STATUSES.length + 1)
    expect(UNCONFIRMED_VIEW.meaning).toContain('a second one is never created')
  })

  it('keeps the distinguishable outcomes distinct', () => {
    const labels = (['draft', 'pending', 'accepted', 'rejected', 'cancelled', 'unknown'] as const).map((s) => sendStatusView(s).label)
    expect(labels).toEqual(['Awaiting approval', 'Queued', 'Accepted by provider', 'Rejected', 'Cancelled', 'Outcome unknown'])
  })
})

describe('allowed actions', () => {
  it('allows approval only while awaiting approval', () => {
    expect(SEND_STATUSES.filter(canApprove)).toEqual(['draft'])
  })

  it('allows cancelling only before the provider may have been called', () => {
    expect(SEND_STATUSES.filter(canCancel)).toEqual(['draft', 'pending'])
  })

  it('allows replacing only a request that has not reached, and cannot reach, the provider', () => {
    expect(SEND_STATUSES.filter(canReplace).sort()).toEqual(['cancelled', 'draft', 'pending', 'rejected'])
  })

  it('treats unknown as unsettled, because reconciliation may still resolve it', () => {
    expect(SEND_STATUSES.filter(isSettled)).toEqual(['accepted', 'rejected', 'cancelled'])
  })
})

describe('status checking', () => {
  it('backs off while queued or sending and stops at the limit', () => {
    expect(nextPollDelay('pending', 0)).toBe(1500)
    expect(nextPollDelay('dispatching', 3)).toBe(4500)
    expect(nextPollDelay('pending', 20)).toBe(10_000)
    expect(nextPollDelay('pending', MAX_POLL_ATTEMPTS - 1)).toBe(10_000)
    expect(nextPollDelay('pending', MAX_POLL_ATTEMPTS)).toBeNull()
  })

  it('never checks automatically for any other status, including unknown', () => {
    for (const status of ['draft', 'accepted', 'rejected', 'cancelled', 'unknown'] as const) expect(nextPollDelay(status, 0)).toBeNull()
  })
})

describe('content checks', () => {
  it('normalises case, spacing and duplicates the way the server does', () => {
    const result = checkSendContent(content({ to: [' A@Example.com ', 'a@example.com'], cc: ['a@example.com', 'b@example.com'], bcc: ['B@example.com', 'c@example.com'], subject: '  Hi  ' }))
    expect(result).toEqual({ ok: true, content: { mailboxId: 'mbx-1', to: ['a@example.com'], cc: ['b@example.com'], bcc: ['c@example.com'], subject: 'Hi', body: 'Text' } })
  })

  it('requires a mailbox, a To address, a subject and a body', () => {
    const result = checkSendContent(content({ mailboxId: '', to: [], subject: ' ', body: '' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e) => e.field)).toEqual(['mailboxId', 'to', 'subject', 'body'])
  })

  it('rejects a malformed address in any recipient field', () => {
    const result = checkSendContent(content({ cc: ['not-an-address'] }))
    expect(result).toMatchObject({ ok: false, errors: [{ field: 'cc', message: '"not-an-address" is not a full email address.' }] })
  })

  it('accepts 30 unique recipients and rejects 31', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@example.com`)
    expect(checkSendContent(content({ to: many(30) })).ok).toBe(true)
    expect(checkSendContent(content({ to: many(20), cc: many(31).slice(20) })).ok).toBe(false)
  })

  it('rejects a multi-line or over-long subject and an over-long body', () => {
    expect(checkSendContent(content({ subject: 'a\nb' })).ok).toBe(false)
    expect(checkSendContent(content({ subject: 'x'.repeat(999) })).ok).toBe(false)
    expect(checkSendContent(content({ body: 'x'.repeat(100_001) })).ok).toBe(false)
    expect(checkSendContent(content({ body: 'x'.repeat(100_000) })).ok).toBe(true)
  })

  it('counts each address once across To, CC and BCC', () => {
    expect(recipientCount({ to: ['a@example.com'], cc: ['A@example.com', 'b@example.com'], bcc: [''] })).toBe(2)
  })
})

describe('records and errors', () => {
  it('keeps only a key, a time and the replaced id for an unanswered submission', () => {
    const entry = { key: 'key-1', startedAt: 1, replaces: null }
    expect(pendingKeySchema.parse({ ...entry, body: 'text', to: ['a@example.com'] })).toEqual(entry)
    expect(pendingKeySchema.safeParse({ ...entry, key: 'a/b' }).success).toBe(false)
  })

  it('refuses a new submission at the limit rather than dropping one', () => {
    const full = Array.from({ length: MAX_PENDING_KEYS }, (_, i) => ({ key: `k${i}`, startedAt: i, replaces: null }))
    expect(canStartSubmission(full.slice(1))).toBe(true)
    expect(canStartSubmission(full)).toBe(false)
  })

  it('explains known server codes and names unknown ones', () => {
    expect(describeServerError('quota_exceeded')).toContain('still awaiting approval')
    expect(describeServerError('owner_quota_exceeded')).toContain('across all mailboxes')
    expect(describeServerError('brand_new_code')).toBe('The server refused the request (brand_new_code). Nothing was changed.')
  })
})
