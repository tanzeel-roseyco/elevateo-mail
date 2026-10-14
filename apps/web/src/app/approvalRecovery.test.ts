import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APPROVAL_RECOVERY_KEY, clearApprovalRecovery, persistApprovalRecovery, readApprovalRecovery } from './approvalRecovery'
import type { SendAttempt } from './sendIntent'
const actor = '00000000-0000-4000-8000-000000000001'
const org = '00000000-0000-4000-8000-000000000002'
const mailbox = '00000000-0000-4000-8000-000000000003'
const draft = '00000000-0000-4000-8000-000000000004'
const principal = `${actor}\n${org}`
const key = `${principal}\n${mailbox}\n${draft}`
const attempt: SendAttempt = { input: { mailbox_id: mailbox, operation_id: draft, expected_version: 1, review_digest: 'a'.repeat(64), correspondence_confirmed: true }, phase: 'pending', sendId: null }
describe('bounded nonsecret approval recovery', () => {
  beforeEach(() => { window.sessionStorage.clear(); vi.restoreAllMocks() })
  it('recovers pending as uncertain and preserves only original metadata', () => {
    persistApprovalRecovery(new Map([[key, attempt]]))
    expect(readApprovalRecovery(principal).get(key)).toEqual({ ...attempt, phase: 'uncertain' })
    const raw = window.sessionStorage.getItem(APPROVAL_RECOVERY_KEY)
    expect(raw).not.toContain('sendId'); expect(raw).not.toContain('phase')
    persistApprovalRecovery(new Map([[key, { ...attempt, phase: 'approved', sendId: draft }]]))
    expect(readApprovalRecovery(principal).size).toBe(0)
  })
  it('drops a different principal rather than presenting their retry', () => {
    persistApprovalRecovery(new Map([[key, attempt]]))
    expect(readApprovalRecovery(`${org}\n${actor}`).size).toBe(0)
    expect(window.sessionStorage.getItem(APPROVAL_RECOVERY_KEY)).toBeNull()
  })
  it.each(['null', '{', 'x'.repeat(16385), JSON.stringify({ version: 1, entries: [{ key, input: { ...attempt.input, csrf_token: 'forbidden' } }] })])('rejects malformed or oversized metadata', (raw) => {
    window.sessionStorage.setItem(APPROVAL_RECOVERY_KEY, raw)
    expect(() => readApprovalRecovery(principal)).toThrow()
  })
  it('rejects duplicate owners, mailbox mismatches and the 21-entry boundary', () => {
    const entry = { key, input: attempt.input }
    window.sessionStorage.setItem(APPROVAL_RECOVERY_KEY, JSON.stringify({ version: 1, entries: [entry, entry] }))
    expect(() => readApprovalRecovery(principal)).toThrow()
    expect(() => persistApprovalRecovery(new Map([[key, { ...attempt, input: { ...attempt.input, mailbox_id: actor } }]]))).toThrow()
    const entries = new Map(Array.from({ length: 21 }, (_, index) => [`${principal}\n${mailbox}\n00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, attempt] as const))
    expect(() => persistApprovalRecovery(entries)).toThrow()
  })
  it('propagates unavailable storage and write/remove readback failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
    expect(() => persistApprovalRecovery(new Map([[key, attempt]]))).toThrow('readback')
    vi.restoreAllMocks(); persistApprovalRecovery(new Map([[key, attempt]]))
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => undefined)
    expect(() => clearApprovalRecovery()).toThrow('cleanup')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => readApprovalRecovery(principal)).toThrow('blocked')
  })
})
