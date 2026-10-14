import type { FetchLike } from './http/transport'
import { requestJson } from './http/transport'
import { GatewayError } from './errors'
import { CollaborationErrorSchema } from './contract'
import type { CsrfProof, ReadContext } from './gateway'
import { sequencePutSchema, sequenceSchema, type SequencePut } from '@/features/outreach/sequenceContract'
import {
  CampaignAnalyticsSchema, CampaignPageSchema, CampaignUpdateSchema, IdSchema,
  LeadConsentAttestationSchema, LeadCreateSchema, LeadDetailSchema, LeadPageSchema, LeadSummarySchema, LeadUpdateSchema,
  OutreachCampaignSchema, OutreachPlanSchema,
  type OutreachPlan,
} from './v2Contract'

const seg = (value: string): string => encodeURIComponent(IdSchema.parse(value))
const headers = (ctx: ReadContext, proof?: CsrfProof): Record<string, string> => ({
  'X-Session-Context': ctx.contextId,
  'X-Authorization-Version': ctx.authorizationVersion,
  ...(proof ? { 'X-CSRF-Token': proof.csrfToken } : {}),
})
const page = (query: { cursor?: string; limit?: number }): string => {
  const params = new URLSearchParams()
  if (query.cursor !== undefined) params.set('cursor', IdSchema.parse(query.cursor))
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new GatewayError('transport', 'malformed', 'Invalid page limit.')
    params.set('limit', String(query.limit))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

/** Isolated V2 adapter. No send, provider, account activation or fixture fallback is reachable here. */
export function createV2OutreachGateway(fetchImpl?: FetchLike) {
  const base = fetchImpl === undefined ? { errorSchema: CollaborationErrorSchema } : { fetchImpl, errorSchema: CollaborationErrorSchema }
  return {
    getOutreachSequenceDraft(ctx: ReadContext, campaignId: string, signal: AbortSignal) {
      return requestJson(`/v2/outreach/campaigns/${seg(campaignId)}/sequence`, sequenceSchema, 16_384,
        { ...base, headers: headers(ctx), signal })
    },
    saveOutreachSequenceDraft(ctx: ReadContext, proof: CsrfProof, campaignId: string, input: SequencePut, signal: AbortSignal) {
      const parsed = sequencePutSchema.parse(input)
      if (parsed.campaign_id !== IdSchema.parse(campaignId)) throw new GatewayError('transport', 'malformed', 'Campaign does not match sequence draft.')
      return requestJson(`/v2/outreach/campaigns/${seg(campaignId)}/sequence`, sequenceSchema, 16_384,
        { ...base, method: 'PUT', body: parsed, maxRequestBytes: 16_384, headers: headers(ctx, proof), signal })
    },
    listCampaigns(ctx: ReadContext, query: { cursor?: string; limit?: number }, signal: AbortSignal) {
      return requestJson(`/v2/outreach/campaigns${page(query)}`, CampaignPageSchema, 65_536, { ...base, headers: headers(ctx), signal })
    },
    getCampaign(ctx: ReadContext, campaignId: string, signal: AbortSignal) {
      return requestJson(`/v2/outreach/campaigns/${seg(campaignId)}`, OutreachCampaignSchema, 4_096, { ...base, headers: headers(ctx), signal })
    },
    createCampaign(ctx: ReadContext, proof: CsrfProof, input: OutreachPlan, signal: AbortSignal) {
      return requestJson('/v2/outreach/campaigns', OutreachCampaignSchema, 4_096, {
        ...base, method: 'POST', body: OutreachPlanSchema.parse(input), maxRequestBytes: 2_048, headers: headers(ctx, proof), signal,
      })
    },
    updateCampaign(ctx: ReadContext, proof: CsrfProof, campaignId: string, input: unknown, signal: AbortSignal) {
      return requestJson(`/v2/outreach/campaigns/${seg(campaignId)}`, OutreachCampaignSchema, 4_096, {
        ...base, method: 'PUT', body: CampaignUpdateSchema.parse(input), maxRequestBytes: 2_048, headers: headers(ctx, proof), signal,
      })
    },
    listLeads(ctx: ReadContext, campaignId: string, query: { cursor?: string; limit?: number }, signal: AbortSignal) {
      return requestJson(`/v2/outreach/campaigns/${seg(campaignId)}/leads${page(query)}`, LeadPageSchema, 65_536, { ...base, headers: headers(ctx), signal })
    },
    getLead(ctx: ReadContext, campaignId: string, leadId: string, signal: AbortSignal) {
      return requestJson(`/v2/outreach/campaigns/${seg(campaignId)}/leads/${seg(leadId)}`, LeadDetailSchema, 4_096,
        { ...base, headers: headers(ctx), signal })
    },
    addLead(ctx: ReadContext, proof: CsrfProof, campaignId: string, input: unknown, signal: AbortSignal) {
      return requestJson(`/v2/outreach/campaigns/${seg(campaignId)}/leads`, LeadSummarySchema, 4_096, {
        ...base, method: 'POST', body: LeadCreateSchema.parse(input), maxRequestBytes: 2_048, headers: headers(ctx, proof), signal,
      })
    },
    updateLead(ctx: ReadContext, proof: CsrfProof, campaignId: string, leadId: string, input: unknown, signal: AbortSignal) {
      return requestJson(`/v2/outreach/campaigns/${seg(campaignId)}/leads/${seg(leadId)}`, LeadSummarySchema, 4_096, {
        ...base, method: 'PUT', body: LeadUpdateSchema.parse(input), maxRequestBytes: 2_048, headers: headers(ctx, proof), signal,
      })
    },
    recordConsent(ctx: ReadContext, proof: CsrfProof, campaignId: string, leadId: string, input: unknown, signal: AbortSignal) {
      return requestJson(`/v2/outreach/campaigns/${seg(campaignId)}/leads/${seg(leadId)}/consent`, LeadSummarySchema, 4_096, {
        ...base, method: 'POST', body: LeadConsentAttestationSchema.parse(input), maxRequestBytes: 2_048,
        headers: headers(ctx, proof), signal,
      })
    },
    listAccounts(ctx: ReadContext, campaignId: string, query: { cursor?: string; limit?: number }, signal: AbortSignal): Promise<never> {
      void ctx; void campaignId; void query; void signal
      return Promise.reject(new GatewayError('api', 'temporarily_unavailable', 'Account scope is not yet available.'))
    },
    getAccount(ctx: ReadContext, campaignId: string, accountId: string, signal: AbortSignal): Promise<never> {
      void ctx; void campaignId; void accountId; void signal
      return Promise.reject(new GatewayError('api', 'temporarily_unavailable', 'Account scope is not yet available.'))
    },
    listAnalytics(ctx: ReadContext, campaignId: string, signal: AbortSignal) {
      return requestJson(`/v2/outreach/campaigns/${seg(campaignId)}/analytics`, CampaignAnalyticsSchema, 4_096, {
        ...base, headers: headers(ctx), signal,
      })
    },
  }
}
