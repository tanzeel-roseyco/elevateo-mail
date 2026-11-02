// Feature registration stays static (ids, routes, sidebar entries validate at module load) while
// every registered page is a lazy chunk, so first paint never downloads outreach, people or the
// email finder.
import { describe, expect, it } from 'vitest'
import { createOutreachFeatureModule } from '@/features/outreach/featureModule'
import { FEATURE_MODULES, featureRegistry, featureRoutes } from './features'

const LAZY = Symbol.for('react.lazy')
const isLazyElement = (element: { type: unknown }) =>
  typeof element.type === 'object' && element.type !== null && (element.type as { $$typeof?: symbol }).$$typeof === LAZY

describe('feature modules', () => {
  it('registers the same ids, routes and nav entries as the owner modules', () => {
    expect(FEATURE_MODULES.map((module) => module.id)).toEqual(['outreach', 'lyra-people-settings', 'email-finder'])
    expect(featureRegistry.navBySection.outreach.map((entry) => entry.label)).toEqual(['Campaigns', 'Leads', 'Accounts', 'Analytics'])
    expect(featureRegistry.navBySection.contacts.map((entry) => entry.path)).toEqual(['/people', '/email-finder'])
    const outreachShape = createOutreachFeatureModule({})
    expect(FEATURE_MODULES[0]?.routes).toEqual(outreachShape.routes)
    expect(featureRoutes.map((route) => route.path)).toEqual([...outreachShape.routes, '/people', '/email-finder'])
  })

  it('renders every route through a lazy page element', () => {
    for (const element of Object.values(createOutreachFeatureModule({}).elements)) expect(isLazyElement(element)).toBe(true)
    for (const module of FEATURE_MODULES.slice(1)) {
      for (const element of Object.values(module.elements)) expect(isLazyElement(element)).toBe(true)
    }
    // Outreach routes are thin session-bound wrappers whose rendered element is the lazy page above.
    for (const route of featureRoutes) expect(route.element).toBeDefined()
  })
})
