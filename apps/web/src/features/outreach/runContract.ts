import { z } from 'zod'
import { SendStateSchema } from '@/data/sendContract'

// AIDEV-NOTE: A run freezes a single message and exact bounded audience; eligibility remains server-owned.
const id = z.uuid()
const hasControl = (value: string, body = false) => [...value].some((char) => {
  const code = char.charCodeAt(0)
  return code === 127 || (code < 32 && !(body && [9, 10, 13].includes(code)))
})
export const campaignRunInputSchema = z.strictObject({
  operation_id: id, expected_campaign_version: z.number().int().min(1).max(2_147_483_647), mailbox_id: id,
  subject: z.string().min(1).max(998).refine((value) => value.trim().length > 0 && new TextEncoder().encode(value).length <= 998 && !hasControl(value)),
  body_text: z.string().min(1).max(65_536).refine((value) => value.trim().length > 0 && new TextEncoder().encode(value).length <= 65_536 && !hasControl(value, true)), marketing_confirmed: z.literal(true),
  lead_ids: z.array(id).min(1).max(25).refine((values) => new Set(values).size === values.length),
})
export const campaignRunSchema = z.strictObject({
  id, campaign_id: id, mailbox_id: id, operation_id: id, state: z.enum(['queued', 'cancelled']),
  subject: z.string().max(998), body_text: z.string().max(65_536), created_at: z.iso.datetime({ offset: true }), simulated: z.boolean(),
  recipients: z.array(z.strictObject({
    lead_id: id, email: z.email(), draft_id: id, send_id: id, state: SendStateSchema,
    delivery_state: z.enum(['sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'suppressed']).nullable(),
  })).min(1).max(25).refine((values) => new Set(values.map((value) => value.lead_id)).size === values.length),
})
export const campaignRunPageSchema = z.strictObject({ items: z.array(campaignRunSchema).max(10), next_cursor: id.nullable() })
export type CampaignRunInput = z.infer<typeof campaignRunInputSchema>
export type CampaignRun = z.infer<typeof campaignRunSchema>
