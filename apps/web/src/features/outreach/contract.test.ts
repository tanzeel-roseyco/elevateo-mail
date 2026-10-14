import { describe, expect, it } from 'vitest'
import { campaignPageSchema, leadPageSchema, analyticsSchema, addLeadInputSchema, consentEvidenceInputSchema, createCampaignInputSchema, updateCampaignInputSchema } from './contract'

const campaignId = '1a40d184-987d-4b50-98d2-f674e41842f9'
const leadId = '7206b079-7c79-4d06-a025-d80649b39573'

describe('Outreach provisional read boundary', () => {
  it('accepts a paused campaign and granted but suppressed lead without inferring eligibility', () => {
    expect(campaignPageSchema.parse({ items: [{ id: campaignId, name: 'Pilot', status: 'paused', version: 1 }], next_cursor: null }).items[0].status).toBe('paused')
    expect(leadPageSchema.parse({ items: [{ id: leadId, campaign_id: campaignId, email: 'test@example.invalid', consent_status: 'granted', suppressed: true, version: 1 }], next_cursor: null }).items[0].suppressed).toBe(true)
  })
  it('rejects a legacy active status or omitted suppression field', () => {
    expect(campaignPageSchema.safeParse({ items: [{ id: campaignId, name: 'Pilot', status: 'active', version: 1 }], next_cursor: null }).success).toBe(false)
    expect(leadPageSchema.safeParse({ items: [{ id: leadId, campaign_id: campaignId, email: 'test@example.invalid', consent_status: 'granted', version: 1 }], next_cursor: null }).success).toBe(false)
  })
  it('rejects impossible analytics and extra fields', () => {
    expect(analyticsSchema.safeParse({ campaign_id: campaignId, lead_count: 1, consented_count: 2 }).success).toBe(false)
    expect(campaignPageSchema.safeParse({ items: [{ id: campaignId, name: 'Pilot', status: 'draft', version: 1, can_send: true }], next_cursor: null }).success).toBe(false)
  })
  it('accepts only draft/paused mutations and no client consent claim', () => {
    expect(createCampaignInputSchema.parse({ id: campaignId, operation_id: leadId, name: 'Pilot', status: 'draft' })).toEqual({ id: campaignId, operation_id: leadId, name: 'Pilot', status: 'draft' })
    expect(updateCampaignInputSchema.safeParse({ operation_id: leadId, expected_version: 1, name: 'Pilot', status: 'active' }).success).toBe(false)
    expect(addLeadInputSchema.safeParse({ id: leadId, operation_id: campaignId, email: 'test@example.invalid', consent_status: 'granted' }).success).toBe(false)
  })
  it('requires explicit evidence and rejects control characters for a consent record', () => {
    const input = { operation_id: campaignId, expected_version: 1, source: 'Signed form', observed_at: '2026-10-14T12:00:00Z', attested: true }
    expect(consentEvidenceInputSchema.safeParse(input).success).toBe(true)
    expect(consentEvidenceInputSchema.safeParse({ ...input, attested: false }).success).toBe(false)
    expect(consentEvidenceInputSchema.safeParse({ ...input, source: 'form\nwrong' }).success).toBe(false)
  })
})
