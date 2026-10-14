// Feature module registration (FE-805). This is the single place where Mira/Celeste/Lyra feature
// exports are bound to shell routes and sidebar sections. Each owner adds one FeatureModule here
// (request the edit from Fable via the control outbox); the pure registry validates the result.
//
// AIDEV-NOTE: Until a module is integrated, its routes render FeaturePlaceholderPage so the shell
// stays truthful: the link exists, the page says the module is not in this build. No fake data.
import type { ReactElement } from 'react'
import { buildFeatureRegistry, type FeatureRegistration } from '../featureRegistry'
import { FeaturePlaceholderPage } from './FeaturePlaceholderPage'

export interface FeatureModule extends FeatureRegistration {
  /** One element per registered route path; keys must equal `routes` exactly. */
  readonly elements: Readonly<Record<string, ReactElement>>
}

const outreachPlaceholder = (title: string) => <FeaturePlaceholderPage title={title} owner="Outreach (Celeste FE-807)" />

/** Outreach seam for Celeste FE-807: paths agreed in TEAM-PLAN (campaigns/leads/accounts/analytics). */
const outreach: FeatureModule = {
  id: 'celeste-outreach',
  routes: ['/outreach/campaigns', '/outreach/leads', '/outreach/accounts', '/outreach/analytics'],
  nav: [
    { path: '/outreach/campaigns', label: 'Campaigns', section: 'outreach', order: 10 },
    { path: '/outreach/leads', label: 'Leads', section: 'outreach', order: 20 },
    { path: '/outreach/accounts', label: 'Accounts', section: 'outreach', order: 30 },
    { path: '/outreach/analytics', label: 'Analytics', section: 'outreach', order: 40 },
  ],
  elements: {
    '/outreach/campaigns': outreachPlaceholder('Campaigns'),
    '/outreach/leads': outreachPlaceholder('Leads'),
    '/outreach/accounts': outreachPlaceholder('Accounts'),
    '/outreach/analytics': outreachPlaceholder('Analytics'),
  },
}

// Mira (inbox) and Lyra (members) keep their existing mailbox-scoped routes in App.tsx; they
// register here only when they export new top-level areas.
export const FEATURE_MODULES: readonly FeatureModule[] = [outreach]

/** Validated at module load: a bad registration fails the build/test run rather than the user. */
export const featureRegistry = buildFeatureRegistry(FEATURE_MODULES)

for (const module of FEATURE_MODULES) {
  const keys = Object.keys(module.elements).sort()
  const routes = [...module.routes].sort()
  if (keys.length !== routes.length || keys.some((key, i) => key !== routes[i])) {
    throw new Error(`Feature "${module.id}" elements must map exactly its routes`)
  }
}

/** Flat route list for App.tsx. */
export const featureRoutes: ReadonlyArray<{ path: string; element: ReactElement }> = FEATURE_MODULES.flatMap((module) =>
  module.routes.map((path) => ({ path, element: module.elements[path] as ReactElement })),
)
