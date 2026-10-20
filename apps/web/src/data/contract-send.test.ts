// Bidirectional schema/type equality catches drift from the generated canonical send client.
import type { z } from 'zod'
import type { components } from './generated/api'
import sendFixtures from '../../../../contracts/v1/send-fixtures.json'
import { describe, expect, it } from 'vitest'
import { ApprovalResultSchema, CancellationResultSchema, SendApprovalInputSchema, SendCancellationInputSchema, SendErrorSchema, SendReviewSchema, SendStatusSchema } from './sendContract'
import { APPROVAL, REVIEW, STATUS } from '@/features/send/sendTestData'

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const typed: [
  Same<z.infer<typeof SendReviewSchema>, components['schemas']['SendReview']>,
  Same<z.infer<typeof SendApprovalInputSchema>, components['schemas']['SendApprovalInput']>,
  Same<z.infer<typeof ApprovalResultSchema>, components['schemas']['ApprovalResult']>,
  Same<z.infer<typeof SendStatusSchema>, components['schemas']['SendStatus']>,
  Same<z.infer<typeof SendCancellationInputSchema>, components['schemas']['SendCancellationInput']>,
  Same<z.infer<typeof CancellationResultSchema>, components['schemas']['CancellationResult']>,
  Same<z.infer<typeof SendErrorSchema>, components['schemas']['SendError']>,
] = [true, true, true, true, true, true, true]

describe('canonical send contract equality', () => {
  it('pins every generated send component to its runtime validator', () => expect(typed.every(Boolean)).toBe(true))
  it('validates public synthetic review/approval/status examples', () => {
    expect(SendReviewSchema.safeParse(REVIEW).success).toBe(true)
    expect(ApprovalResultSchema.safeParse(APPROVAL).success).toBe(true)
    expect(SendStatusSchema.safeParse(STATUS).success).toBe(true)
  })
  it('accepts marketing only with its recorded consent basis', () => {
    expect(SendReviewSchema.safeParse({ ...REVIEW, purpose: 'marketing', consent_basis: 'recorded_consent' }).success).toBe(true)
    expect(SendReviewSchema.safeParse({ ...REVIEW, purpose: 'marketing' }).success).toBe(false)
    expect(SendReviewSchema.safeParse({ ...REVIEW, consent_basis: 'recorded_consent' }).success).toBe(false)
  })
  it('validates every canonical synthetic send fixture', () => {
    for (const fixture of sendFixtures.examples) {
      const schema = { SendReview: SendReviewSchema, ApprovalResult: ApprovalResultSchema, SendStatus: SendStatusSchema, CancellationResult: CancellationResultSchema, SendError: SendErrorSchema }[fixture.schema as 'SendReview' | 'ApprovalResult' | 'SendStatus' | 'CancellationResult' | 'SendError']
      expect(schema.safeParse(fixture.value).success, fixture.name).toBe(true)
    }
    expect(SendApprovalInputSchema.safeParse(sendFixtures.approval_input).success).toBe(true)
  })
  it('permits absent-policy display and 210 readiness issues but requires ready/digest consistency', () => {
    const issue = { code: 'recipient_invalid', recipient_index: 0 }
    expect(SendReviewSchema.safeParse({ ...REVIEW, policy_revision: '0', ready: false, review_digest: null, issues: Array.from({ length: 210 }, () => issue) }).success).toBe(true)
    expect(SendReviewSchema.safeParse({ ...REVIEW, ready: false }).success).toBe(false)
    expect(SendReviewSchema.safeParse({ ...REVIEW, review_digest: null }).success).toBe(false)
    expect(SendReviewSchema.safeParse({ ...REVIEW, issues: Array.from({ length: 211 }, () => issue) }).success).toBe(false)
  })
})
