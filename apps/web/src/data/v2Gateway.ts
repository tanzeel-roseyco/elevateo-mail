import type { FetchLike } from './http/transport'
import { requestJson } from './http/transport'
import { createV2PreferencesGateway } from './v2PreferencesGateway'
import { CollaborationErrorSchema } from './contract'
import type { CsrfProof, ReadContext } from './gateway'
import {
  GrantChangeSchema,
  IdSchema,
  RosterPageSchema,
  OrganizationGrantSchema,
  OrganizationGrantsSchema,
  OutreachCampaignSchema,
  CampaignPageSchema,
  DirectMessagePageSchema,
  OutreachPlanSchema,
  type GrantChange,
  type OutreachPlan,
} from './v2Contract'

// AIDEV-NOTE: Owner UI may call this port only after the V2 server gate is accepted; no worker endpoint enters browser code.
const id = (value: string): string => encodeURIComponent(IdSchema.parse(value))
const pageQuery = (query: { cursor?: string; limit?: number }): string => {
  const params = new URLSearchParams()
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50) throw new Error('Invalid page limit')
    params.set('limit', String(query.limit))
  }
  if (query.cursor !== undefined) {
    if (query.cursor.length < 1 || query.cursor.length > 2048) throw new Error('Invalid page cursor')
    params.set('cursor', query.cursor)
  }
  const encoded = params.toString()
  return encoded === '' ? '' : `?${encoded}`
}
const headers = (ctx: ReadContext, proof?: CsrfProof): Record<string, string> => ({
  'X-Session-Context': ctx.contextId,
  'X-Authorization-Version': ctx.authorizationVersion,
  ...(proof === undefined ? {} : { 'X-CSRF-Token': proof.csrfToken }),
})

export function createV2Gateway(fetchImpl?: FetchLike) {
  const base = fetchImpl === undefined ? { errorSchema: CollaborationErrorSchema } : { fetchImpl, errorSchema: CollaborationErrorSchema }
  return {
    // PREF822 remains a separate proposal until its Rails route and SQL evidence are admitted.
    ...createV2PreferencesGateway(fetchImpl),
    getDirectMessage(ctx: ReadContext, mailboxId: string, threadId: string, messageId: string, signal?: AbortSignal) {
      const query = new URLSearchParams({ mailbox_id: IdSchema.parse(mailboxId) })
      return requestJson(`/v2/threads/${id(threadId)}/messages/${id(messageId)}?${query}`, DirectMessagePageSchema, 2_097_152, {
        ...base, headers: headers(ctx), signal,
      })
    },
    listCampaigns(ctx: ReadContext, signal?: AbortSignal) {
      return requestJson('/v2/outreach/campaigns', CampaignPageSchema, 20_480, { ...base, headers: headers(ctx), signal })
    },
    listOrganizationGrants(organizationId: string, ctx: ReadContext, signal?: AbortSignal, query: { cursor?: string; limit?: number } = {}) {
      return requestJson(`/v2/organizations/${id(organizationId)}/grants${pageQuery(query)}`, OrganizationGrantsSchema, 32_768, {
        ...base, headers: headers(ctx), signal,
      })
    },
    getOrganizationRoster(organizationId: string, ctx: ReadContext, signal?: AbortSignal, query: { cursor?: string; limit?: number } = {}) {
      return requestJson(`/v2/organizations/${id(organizationId)}/roster${pageQuery(query)}`, RosterPageSchema, 8_192, {
        ...base, headers: headers(ctx), signal,
      })
    },
    replaceOrganizationGrant(organizationId: string, userId: string, change: GrantChange, ctx: ReadContext, proof: CsrfProof, signal?: AbortSignal) {
      return requestJson(`/v2/organizations/${id(organizationId)}/grants/${id(userId)}`, OrganizationGrantSchema, 4_096, {
        ...base, method: 'PUT', body: GrantChangeSchema.parse(change), headers: headers(ctx, proof), maxRequestBytes: 2_048, signal,
      })
    },
    createOutreachCampaign(plan: OutreachPlan, ctx: ReadContext, proof: CsrfProof, signal?: AbortSignal) {
      return requestJson('/v2/outreach/campaigns', OutreachCampaignSchema, 4_096, {
        ...base, method: 'POST', body: OutreachPlanSchema.parse(plan), headers: headers(ctx, proof), maxRequestBytes: 2_048, signal,
      })
    },
  }
}
