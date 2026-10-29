// Settings area frame (DESIGN-SPEC §3 "Settings pages"): breadcrumb, page header, the secondary
// settings tabs (Workspace · Profile · Tags · Developer API · Webhooks · Integrations; EmailGuard's
// Billing tab is intentionally absent) and the routed section underneath.
//
// AIDEV-NOTE: Page titles come from a route table here rather than from each page so the header
// and breadcrumb land at the same position on every settings URL (reference: title at y≈38).
import type { ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Breadcrumbs, type Crumb } from '@/ui/Breadcrumbs'
import { Callout } from '@/ui/Callout'
import { PageHeader } from '@/ui/PageHeader'
import { LinkTabs, type LinkTab } from '@/ui/Tabs'

export const SETTINGS_TABS: readonly LinkTab[] = [
  { to: '/settings/workspace', label: 'Workspace', end: false, activeAt: ['/settings'] },
  { to: '/settings/profile', label: 'Profile', end: false },
  { to: '/settings/tags', label: 'Tags', end: false },
  { to: '/settings/developer-api', label: 'Developer API', end: false },
  { to: '/settings/webhooks', label: 'Webhooks', end: false },
  { to: '/settings/integrations', label: 'Integrations', end: false },
]

interface PageMeta {
  /** Pathname (hash route) this entry describes; longest match wins. */
  path: string
  title: string
  subtitle: string
  /** Parent crumbs; "Home" is always first and the current title last. */
  parents?: readonly Crumb[]
}

const WORKSPACE: Crumb = { label: 'Workspace', to: '/settings/workspace' }
const PROFILE: Crumb = { label: 'Profile', to: '/settings/profile' }
const WEBHOOKS: Crumb = { label: 'Webhooks', to: '/settings/webhooks' }
const INTEGRATIONS: Crumb = { label: 'Integrations', to: '/settings/integrations' }

const PAGES: readonly PageMeta[] = [
  { path: '/settings/workspace', title: 'Current Workspace', subtitle: 'Manage your current workspace' },
  { path: '/settings/workspace/name', title: 'Update Workspace Name', subtitle: 'Modify your current workspace name', parents: [WORKSPACE] },
  { path: '/settings/workspace/invite', title: 'Invite New Members', subtitle: 'Invite team members to collaborate', parents: [WORKSPACE] },
  { path: '/settings/workspace/members', title: 'Manage Members', subtitle: 'Organization grants and mailbox membership', parents: [WORKSPACE] },
  { path: '/settings/workspace/invitations', title: 'Pending Invitations', subtitle: 'Edit or remove pending member invitations', parents: [WORKSPACE] },
  { path: '/settings/workspace/create', title: 'Create a New Workspace', subtitle: 'Create a new workspace to separate your data', parents: [WORKSPACE] },
  { path: '/settings/profile', title: 'Profile', subtitle: 'Update your profile settings' },
  { path: '/settings/profile/personal-details', title: 'Personal Details', subtitle: 'Modify your personal profile details', parents: [PROFILE] },
  { path: '/settings/profile/password', title: 'Password', subtitle: 'Update your password', parents: [PROFILE] },
  { path: '/settings/tags', title: 'Custom Tags', subtitle: 'Manage all your tags for this workspace' },
  { path: '/settings/developer-api', title: 'Developer API', subtitle: 'Reference, tokens and tooling for the Elevateo API' },
  { path: '/settings/webhooks', title: 'Webhook URLs', subtitle: 'Manage webhook endpoints to receive real-time notifications' },
  { path: '/settings/webhooks/create', title: 'Add New Webhook', subtitle: 'Register an endpoint for workspace events', parents: [WEBHOOKS] },
  { path: '/settings/integrations', title: 'Integrations', subtitle: 'Connect Elevateo with the tools your workspace uses' },
  { path: '/settings/integrations/mcp', title: 'Connections', subtitle: 'AI clients that can read your mail and draft replies', parents: [INTEGRATIONS] },
  { path: '/settings/integrations/cli', title: 'Elevateo CLI', subtitle: 'Work with drafts and conversations from a terminal', parents: [INTEGRATIONS] },
]

/** Longest registered prefix of the current pathname (exported for the layout test). */
export function settingsPageMeta(pathname: string): PageMeta {
  let best: PageMeta | undefined
  for (const page of PAGES) {
    const within = pathname === page.path || pathname.startsWith(`${page.path}/`)
    if (within && (best === undefined || page.path.length > best.path.length)) best = page
  }
  return best ?? PAGES[0]!
}

export function SettingsLayout() {
  const { pathname } = useLocation()
  const meta = settingsPageMeta(pathname)
  const crumbs: readonly Crumb[] = [{ label: 'Home', to: '/' }, ...(meta.parents ?? []), { label: meta.title }]
  return (
    <section aria-label="Settings">
      <Breadcrumbs crumbs={crumbs} />
      <PageHeader title={meta.title} subtitle={meta.subtitle} className="mb-6" />
      <LinkTabs tabs={SETTINGS_TABS} label="Settings sections" className="mb-8" />
      <Outlet />
    </section>
  )
}

/** The mandatory label on every page whose data is a local, non-server adapter. */
export function SimulatedAdapterNotice({ children }: { children?: ReactNode }) {
  return (
    <Callout variant="neutral" heading="Simulated UI adapter: not saved on the server" className="mb-6 max-w-3xl">
      {children ?? 'This build has no server endpoint for these settings. Changes are kept in this browser only, for this workspace, and never reach other members.'}
    </Callout>
  )
}
