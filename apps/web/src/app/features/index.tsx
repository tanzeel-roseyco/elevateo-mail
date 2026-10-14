// Feature module registration (FE-805). This is the single place where owner exports are bound to
// shell routes and sidebar sections. Owners export pages from their own paths; Fable wires them
// here with the session context and the optional feature gateways (./featureGateways).
//
// AIDEV-NOTE: Route elements are thin wrappers: they read URL/session/capability state and pass
// explicit props to the owner page, so owner components stay testable without the shell.
import type { ReactElement } from 'react'
import { useSession } from '../session'
import { useFeatureGateways } from '../featureGateways'
import { buildFeatureRegistry, type FeatureRegistration } from '../featureRegistry'
import { FeatureNotConnectedPage } from './FeatureNotConnectedPage'
import { OutreachAccountsPage, OutreachAnalyticsPage, OutreachCampaignsPage, OutreachLeadsPage, type OutreachPageProps } from '@/features/outreach/OutreachPages'
import { AdministrationPage } from '@/features/members/AdministrationPage'

export interface FeatureModule extends FeatureRegistration {
  /** One element per registered route path; keys must equal `routes` exactly. */
  readonly elements: Readonly<Record<string, ReactElement>>
}

// --- Outreach (Celeste FE-807) -------------------------------------------------------------
// Celeste's pages accept optional reads/context and render their own unavailable/error states.
// exactOptionalPropertyTypes forbids passing `undefined` explicitly, hence the conditional spread.
function useOutreachProps(): OutreachPageProps {
  const { context } = useSession()
  const { outreach } = useFeatureGateways()
  return { ...(outreach === undefined ? {} : { reads: outreach }), ...(context === null ? {} : { context }) }
}
function CampaignsRoute() { return <OutreachCampaignsPage {...useOutreachProps()} /> }
function LeadsRoute() { return <OutreachLeadsPage {...useOutreachProps()} /> }
function AccountsRoute() { return <OutreachAccountsPage {...useOutreachProps()} /> }
function AnalyticsRoute() { return <OutreachAnalyticsPage {...useOutreachProps()} /> }

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
    '/outreach/campaigns': <CampaignsRoute />,
    '/outreach/leads': <LeadsRoute />,
    '/outreach/accounts': <AccountsRoute />,
    '/outreach/analytics': <AnalyticsRoute />,
  },
}

// --- Organization administration (Lyra FE-808) -------------------------------------------
// Lyra's page requires a gateway; without the V2 admin capability the route states that plainly.
function AdministrationRoute({ section }: { section: 'people' | 'settings' }) {
  const { admin } = useFeatureGateways()
  if (admin === undefined) {
    return <FeatureNotConnectedPage title={section === 'people' ? 'People' : 'Settings'} dependency="the organization administration gateway (V2 grants)" />
  }
  return <AdministrationPage gateway={admin} section={section} />
}

const organization: FeatureModule = {
  id: 'lyra-organization',
  routes: ['/people', '/settings'],
  nav: [
    { path: '/people', label: 'People', section: 'organization', order: 10 },
    { path: '/settings', label: 'Settings', section: 'organization', order: 20 },
  ],
  elements: { '/people': <AdministrationRoute section="people" />, '/settings': <AdministrationRoute section="settings" /> },
}

// Mira (FE-806) keeps her mailbox-scoped inbox/thread/draft routes in App.tsx; nothing to add here.
export const FEATURE_MODULES: readonly FeatureModule[] = [outreach, organization]

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
