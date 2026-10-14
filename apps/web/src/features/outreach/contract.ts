import { z } from 'zod'
import type { ReadContext } from '@/data/gateway'

// AIDEV-NOTE: Provisional FE-807 read boundary. Cassian must reconcile exact V2 wire names
// before connecting HTTP. Eligibility and suppression are server-owned decisions.
const id = z.string().uuid()
const label = z.string().min(1).max(200)
export const campaignSchema = z.strictObject({ id, name: label, status: z.enum(['draft', 'paused']) })
export const leadSchema = z.strictObject({ id, email: z.email(), consent_status: z.enum(['granted', 'unknown', 'withdrawn']), suppressed: z.boolean() })
export const accountSchema = z.strictObject({ id, mailbox_id: id, label, status: z.literal('disabled') })
export const analyticsSchema = z.strictObject({ campaign_id: id, lead_count: z.number().int().nonnegative(), consented_count: z.number().int().nonnegative() }).refine(
  (value) => value.consented_count <= value.lead_count,
  { message: 'Consented count exceeds lead count' },
)
export const campaignPageSchema = z.strictObject({ items: z.array(campaignSchema).max(100) })
export const leadPageSchema = z.strictObject({ items: z.array(leadSchema).max(100) })
export const accountPageSchema = z.strictObject({ items: z.array(accountSchema).max(100) })
export const analyticsPageSchema = z.strictObject({ items: z.array(analyticsSchema).max(100) })
export const createCampaignInputSchema = z.strictObject({ name: label, status: z.literal('draft') })
export const updateCampaignInputSchema = z.strictObject({ name: label, status: z.enum(['draft', 'paused']) })
// A new lead cannot assert consent. Proof and suppression policy are server-owned.
export const addLeadInputSchema = z.strictObject({ campaign_id: id, email: z.email() })
export const updateLeadInputSchema = z.strictObject({ email: z.email() })

export type Campaign = z.infer<typeof campaignSchema>
export type Lead = z.infer<typeof leadSchema>
export type Account = z.infer<typeof accountSchema>
export type Analytics = z.infer<typeof analyticsSchema>

export interface OutreachGateway {
  listCampaigns(ctx: ReadContext, signal: AbortSignal): Promise<unknown>
  getCampaign(ctx: ReadContext, campaignId: string, signal: AbortSignal): Promise<unknown>
  createCampaign(ctx: ReadContext, proof: { csrfToken: string }, input: z.infer<typeof createCampaignInputSchema>, signal: AbortSignal): Promise<unknown>
  updateCampaign(ctx: ReadContext, proof: { csrfToken: string }, campaignId: string, input: z.infer<typeof updateCampaignInputSchema>, signal: AbortSignal): Promise<unknown>
  listLeads(ctx: ReadContext, campaignId: string, signal: AbortSignal): Promise<unknown>
  addLead(ctx: ReadContext, proof: { csrfToken: string }, input: z.infer<typeof addLeadInputSchema>, signal: AbortSignal): Promise<unknown>
  updateLead(ctx: ReadContext, proof: { csrfToken: string }, leadId: string, input: z.infer<typeof updateLeadInputSchema>, signal: AbortSignal): Promise<unknown>
  listAccounts(ctx: ReadContext, campaignId: string, signal: AbortSignal): Promise<unknown>
  getAccount(ctx: ReadContext, campaignId: string, accountId: string, signal: AbortSignal): Promise<unknown>
  listAnalytics(ctx: ReadContext, campaignId: string, signal: AbortSignal): Promise<unknown>
}

export type OutreachReads = Pick<OutreachGateway, 'listCampaigns' | 'listLeads' | 'listAccounts' | 'listAnalytics'>
