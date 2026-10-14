import { describe, expect, it } from 'vitest'
import { campaignPageSchema, leadPageSchema, analyticsPageSchema } from './contract'

const campaignId = '1a40d184-987d-4b50-98d2-f674e41842f9'
const leadId = '7206b079-7c79-4d06-a025-d80649b39573'

describe('Outreach provisional read boundary', () => {
  it('accepts a paused campaign and granted but suppressed lead without inferring eligibility', () => {
    expect(campaignPageSchema.parse({ items: [{ id: campaignId, name: 'Pilot', status: 'paused' }] }).items[0].status).toBe('paused')
    expect(leadPageSchema.parse({ items: [{ id: leadId, email: 'test@example.invalid', consent_status: 'granted', suppressed: true }] }).items[0].suppressed).toBe(true)
  })
  it('rejects a legacy active status or omitted suppression field', () => {
    expect(campaignPageSchema.safeParse({ items: [{ id: campaignId, name: 'Pilot', status: 'active' }] }).success).toBe(false)
    expect(leadPageSchema.safeParse({ items: [{ id: leadId, email: 'test@example.invalid', consent_status: 'granted' }] }).success).toBe(false)
  })
  it('rejects impossible analytics and extra fields', () => {
    expect(analyticsPageSchema.safeParse({ items: [{ campaign_id: campaignId, lead_count: 1, consented_count: 2 }] }).success).toBe(false)
    expect(campaignPageSchema.safeParse({ items: [{ id: campaignId, name: 'Pilot', status: 'draft', can_send: true }] }).success).toBe(false)
  })
})
