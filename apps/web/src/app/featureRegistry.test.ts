import { describe, expect, it } from 'vitest'
import { buildFeatureRegistry, FeatureRegistryError, isValidRoutePath, type FeatureRegistration } from './featureRegistry'

const outreach: FeatureRegistration = {
  id: 'celeste-outreach',
  routes: ['/outreach/campaigns', '/outreach/campaigns/:campaignId', '/outreach/leads'],
  nav: [
    { path: '/outreach/leads', label: 'Leads', section: 'outreach', order: 20 },
    { path: '/outreach/campaigns', label: 'Campaigns', section: 'outreach', order: 10 },
  ],
}

describe('feature registry', () => {
  it('groups nav entries by section and sorts by order within a section (happy path)', () => {
    const registry = buildFeatureRegistry([outreach])
    expect(registry.navBySection.outreach.map((e) => e.label)).toEqual(['Campaigns', 'Leads'])
    expect(registry.navBySection.mail).toEqual([])
    expect(registry.modules).toHaveLength(1)
  })

  it('rejects a second module that re-registers an existing route path', () => {
    const clash: FeatureRegistration = { id: 'other', routes: ['/outreach/leads'], nav: [] }
    expect(() => buildFeatureRegistry([outreach, clash])).toThrow(FeatureRegistryError)
    expect(() => buildFeatureRegistry([outreach, clash])).toThrow(/re-registers route path: "\/outreach\/leads"/)
  })

  it('rejects malformed paths, nav entries without a route, empty ids and blank labels', () => {
    expect(isValidRoutePath('/outreach/campaigns/:campaignId')).toBe(true)
    for (const bad of ['outreach', '/Outreach', '/outreach/', '/a?b=1', '/a#b', '/*', '']) expect(isValidRoutePath(bad)).toBe(false)
    expect(() => buildFeatureRegistry([{ id: 'x', routes: ['/x/'], nav: [] }])).toThrow(/invalid route path/)
    expect(() => buildFeatureRegistry([{ id: 'x', routes: ['/x'], nav: [{ path: '/y', label: 'Y', section: 'mail', order: 0 }] }])).toThrow(/no matching route/)
    expect(() => buildFeatureRegistry([{ id: '', routes: [], nav: [] }])).toThrow(/Duplicate or empty feature id/)
    expect(() => buildFeatureRegistry([{ id: 'x', routes: ['/x'], nav: [{ path: '/x', label: ' ', section: 'mail', order: 0 }] }])).toThrow(/empty label/)
  })
})
