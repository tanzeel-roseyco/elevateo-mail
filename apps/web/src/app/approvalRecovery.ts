// AIDEV-NOTE: Nonsecret replay metadata only; server authorization and draft content never live here.
import { z } from 'zod'
import { SendApprovalInputSchema } from '@/data/sendContract'
import type { SendAttempt } from './sendIntent'

export const APPROVAL_RECOVERY_KEY = 'elevateo.approval-recovery.v1'
const owner = z.string().max(147).refine((value) => {
  const parts = value.split('\n')
  return parts.length === 4 && parts.every((part) => z.uuid().safeParse(part).success)
})
const record = z.strictObject({ key: owner, input: SendApprovalInputSchema })
  .refine((entry) => entry.key.split('\n')[2] === entry.input.mailbox_id)
const envelope = z.strictObject({ version: z.literal(1), entries: z.array(record).max(20) })
const MAX_BYTES = 16384
export const approvalRecoveryMessage = 'Approval retry details could not be saved or recovered in this tab. No new approval was submitted. Restore browser storage before retrying; an earlier approval may already be stored.'

export function readApprovalRecovery(principal: string): Map<string, SendAttempt> {
  const raw = window.sessionStorage.getItem(APPROVAL_RECOVERY_KEY)
  if (raw === null) return new Map()
  if (raw.length > MAX_BYTES) throw new Error('Approval recovery limit exceeded')
  const parsed = envelope.parse(JSON.parse(raw))
  if (new Set(parsed.entries.map((entry) => entry.key)).size !== parsed.entries.length) throw new Error('Duplicate approval recovery owner')
  // AIDEV-NOTE: Storage is untrusted metadata, never a receipt or authority; pending reloads as uncertain.
  if (parsed.entries.some((entry) => !entry.key.startsWith(`${principal}\n`))) {
    clearApprovalRecovery()
    return new Map()
  }
  return new Map(parsed.entries.map((entry) => [entry.key, { input: entry.input, phase: 'uncertain' as const, sendId: null }]))
}
export function persistApprovalRecovery(entries: Map<string, SendAttempt>): void {
  const payload = envelope.parse({ version: 1, entries: [...entries].filter(([, attempt]) => attempt.phase !== 'approved').map(([key, attempt]) => ({ key, input: attempt.input })) })
  const serialized = JSON.stringify(payload)
  if (serialized.length > MAX_BYTES) throw new Error('Approval recovery limit exceeded')
  // AIDEV-NOTE: Durable original binding precedes POST; failed write/readback prevents a new submission.
  window.sessionStorage.setItem(APPROVAL_RECOVERY_KEY, serialized)
  if (window.sessionStorage.getItem(APPROVAL_RECOVERY_KEY) !== serialized) throw new Error('Approval recovery readback failed')
}
export function clearApprovalRecovery(): void {
  window.sessionStorage.removeItem(APPROVAL_RECOVERY_KEY)
  if (window.sessionStorage.getItem(APPROVAL_RECOVERY_KEY) !== null) throw new Error('Approval recovery cleanup failed')
}
