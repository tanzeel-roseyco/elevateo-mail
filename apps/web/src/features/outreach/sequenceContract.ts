import { z } from 'zod'
import type { CsrfProof, ReadContext } from '@/data/gateway'

// AIDEV-NOTE: Candidate FE807 sequence boundary; Cassian owns the canonical V2 schema.
// A sequence is inert metadata. Neither status grants delivery or consent eligibility.
const id = z.string().uuid()
const version = z.number().int().min(1).max(2_147_483_647)
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/)
const label = z.string().min(1).max(120).refine((value) =>
  [...value].every((character) => {
    const code = character.codePointAt(0)
    return code !== undefined && code >= 32 && code !== 127
  }))
const timezone = z.string().min(1).max(128)
export const sequenceStepSchema = z.strictObject({
  id, position: z.number().int().min(1).max(20),
  delay_seconds: z.number().int().min(0).max(2_592_000),
  local_time: localTime, label,
})
const steps = z.array(sequenceStepSchema).min(1).max(20).refine((value) =>
  value.every((step, index) => step.position === index + 1), { message: 'Steps must have consecutive positions' })
export const sequenceSchema = z.strictObject({
  id, campaign_id: id, version, status: z.enum(['draft', 'held']), timezone, steps,
})
export const sequencePutSchema = z.strictObject({
  id, campaign_id: id, operation_id: id, expected_version: z.number().int().min(1).max(2_147_483_646).nullable(),
  status: z.enum(['draft', 'held']), timezone, steps,
})
export type Sequence = z.infer<typeof sequenceSchema>
export type SequenceStep = z.infer<typeof sequenceStepSchema>
export type SequencePut = z.infer<typeof sequencePutSchema>
export interface SequenceGateway {
  getOutreachSequenceDraft(ctx: ReadContext, campaignId: string, signal: AbortSignal): Promise<unknown>
  saveOutreachSequenceDraft(ctx: ReadContext, proof: CsrfProof, campaignId: string, input: SequencePut, signal: AbortSignal): Promise<unknown>
}
