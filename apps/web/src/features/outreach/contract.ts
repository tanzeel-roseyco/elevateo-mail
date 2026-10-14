import { z } from 'zod'
import type { ReadContext } from '@/data/gateway'

// AIDEV-NOTE: Provisional FE-807 read boundary. Cassian must reconcile exact V2 wire names
// before connecting HTTP. Eligibility and suppression are server-owned decisions.
const id = z.string().uuid()
const safeLabel = (maximum: number) => z.string().min(1).max(maximum).refine((value) => !/[\x00-\x1f\x7f]/.test(value))
const campaignName = safeLabel(160)
const version = z.number().int().min(1).max(2_147_483_647)
export const campaignSchema = z.strictObject({ id, name: campaignName, status: z.enum(['draft', 'paused']), version })
export const leadSchema = z.strictObject({ id, campaign_id: id, email: z.email(), consent_status: z.enum(['granted', 'unknown', 'withdrawn']), suppressed: z.boolean(), version })
export const accountSchema = z.strictObject({ id, campaign_id: id, mailbox_id: id, label: safeLabel(120), status: z.literal('disabled'), version })
export const analyticsSchema = z.strictObject({ campaign_id: id, lead_count: z.number().int().nonnegative(), consented_count: z.number().int().nonnegative() }).refine(
  (value) => value.consented_count <= value.lead_count,
  { message: 'Consented count exceeds lead count' },
)
const pageCursor = z.union([id, z.null()])
export const campaignPageSchema = z.strictObject({ items: z.array(campaignSchema).max(100), next_cursor: pageCursor })
export const leadPageSchema = z.strictObject({ items: z.array(leadSchema).max(100), next_cursor: pageCursor })
export const accountPageSchema = z.strictObject({ items: z.array(accountSchema).max(100), next_cursor: pageCursor })
export const createCampaignInputSchema = z.strictObject({ id, operation_id: id, name: campaignName, status: z.literal('draft') })
export const updateCampaignInputSchema = z.strictObject({ operation_id: id, expected_version: version, name: campaignName, status: z.enum(['draft', 'paused']) })
// A new lead cannot assert consent. Proof and suppression policy are server-owned.
export const addLeadInputSchema = z.strictObject({ id, operation_id: id, email: z.email() })
export const updateLeadInputSchema = z.strictObject({ operation_id: id, expected_version: version, email: z.email() })
export const consentEvidenceInputSchema = z.strictObject({
  operation_id: id, expected_version: version,
  source: z.string().min(1).max(200).refine((value) => value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value)),
  observed_at: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/).refine((value) => {
    const parsed = new Date(value)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
  }),
  attested: z.literal(true),
})

export type Campaign = z.infer<typeof campaignSchema>
export type Lead = z.infer<typeof leadSchema>
export type Account = z.infer<typeof accountSchema>
export type Analytics = z.infer<typeof analyticsSchema>
export interface OutreachPageQuery { cursor?: string; limit?: number }

export interface OutreachGateway {
  listCampaigns(ctx: ReadContext, query: OutreachPageQuery, signal: AbortSignal): Promise<unknown>
  getCampaign(ctx: ReadContext, campaignId: string, signal: AbortSignal): Promise<unknown>
  createCampaign(ctx: ReadContext, proof: { csrfToken: string }, input: z.infer<typeof createCampaignInputSchema>, signal: AbortSignal): Promise<unknown>
  updateCampaign(ctx: ReadContext, proof: { csrfToken: string }, campaignId: string, input: z.infer<typeof updateCampaignInputSchema>, signal: AbortSignal): Promise<unknown>
  listLeads(ctx: ReadContext, campaignId: string, query: OutreachPageQuery, signal: AbortSignal): Promise<unknown>
  addLead(ctx: ReadContext, proof: { csrfToken: string }, campaignId: string, input: z.infer<typeof addLeadInputSchema>, signal: AbortSignal): Promise<unknown>
  updateLead(ctx: ReadContext, proof: { csrfToken: string }, campaignId: string, leadId: string, input: z.infer<typeof updateLeadInputSchema>, signal: AbortSignal): Promise<unknown>
  recordConsent?(ctx: ReadContext, proof: { csrfToken: string }, campaignId: string, leadId: string, input: z.infer<typeof consentEvidenceInputSchema>, signal: AbortSignal): Promise<unknown>
  listAccounts(ctx: ReadContext, query: OutreachPageQuery, signal: AbortSignal): Promise<unknown>
  getAccount(ctx: ReadContext, accountId: string, signal: AbortSignal): Promise<unknown>
  listAnalytics(ctx: ReadContext, campaignId: string, signal: AbortSignal): Promise<unknown>
}

export type OutreachReads = Pick<OutreachGateway, 'listCampaigns' | 'listLeads' | 'listAccounts' | 'listAnalytics'>
