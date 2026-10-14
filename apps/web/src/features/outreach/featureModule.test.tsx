import { describe, expect, it } from 'vitest'
import { createOutreachFeatureModule } from './featureModule'

describe('Outreach route registration seam', () => {
  it('exports distinct URL-addressed routes without duplicates or an activation route', () => {
    const module = createOutreachFeatureModule({})
    expect(module.routes).toHaveLength(9)
    expect(new Set(module.routes).size).toBe(module.routes.length)
    expect(module.routes).toContain('/outreach/campaigns/:campaignId/leads')
    expect(module.routes).toContain('/outreach/accounts/:accountId')
    expect(module.routes.some((path) => /send|activate|enroll/.test(path))).toBe(false)
    expect(module.nav.map((entry) => entry.path)).toEqual(['/outreach/campaigns', '/outreach/leads', '/outreach/accounts', '/outreach/analytics'])
  })
})
