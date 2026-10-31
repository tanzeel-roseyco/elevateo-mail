import { useCallback, useEffect, useState } from 'react'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useFeatureGateways } from '@/app/featureGateways'
import { useSession } from '@/app/session'
import { RosterPersonSchema, type OrganizationGrant } from '@/data/v2Contract'
import type { z } from 'zod'
import { createV2Gateway } from '@/data/v2Gateway'
import { GatewayError } from '@/data/errors'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Card } from '@/ui/Card'
import { PageHeader, SectionHeader } from '@/ui/PageHeader'
import { Heading, Subheading } from '@/ui/Text'
import { ShieldCheckIcon } from '@/ui/icons'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { CONFIG_PEOPLE, editableRoles, validActorProjection, validGrantProjection, validRosterProjection, type EditableRole } from './adminModel'

type Grants = { actor: OrganizationGrant; grants: OrganizationGrant[] }
type Roster = { status: 'loading' } | { status: 'ready'; items: z.infer<typeof RosterPersonSchema>[] } | { status: 'unavailable' } | { status: 'error' }
type View = { status: 'loading' } | { status: 'ready'; value: Grants } | { status: 'denied' } | { status: 'error' }
// AIDEV-NOTE: Production uses this real HTTP port; demo/fixture entries inject a simulated one
// through featureGateways.administration so the capture renders fixture data with no failed requests.
const realAdminGateway = createV2Gateway()

function isDenied(error: unknown): boolean {
  return error instanceof GatewayError && error.kind === 'api' && (error.status === 403 || error.status === 404 || error.code === 'not_available')
}

/** Additive V2 administration; no configuration key ever enters a grant mutation. */
export function AdministrationPage({ section }: { section: 'people' | 'organization' }) {
  const { state, refresh } = useSession()
  const { request, proof } = useProtectedRequest()
  const adminGateway = useFeatureGateways().administration ?? realAdminGateway
  const session = state.status === 'ready' ? state.session : null
  const organizationId = session?.organization.id ?? null
  const actorId = session?.actor.id ?? null
  const [view, setView] = useState<View>({ status: 'loading' })
  const [roster, setRoster] = useState<Roster>({ status: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [writeBlocked, setWriteBlocked] = useState(false)
  const [selection, setSelection] = useState<Record<string, EditableRole>>({})

  const load = useCallback(async () => {
    if (!organizationId) return
    setView({ status: 'loading' })
    setNotice(null)
    setSelection({})
    setWriteBlocked(false)
    let cursor: string | undefined
    const grants: OrganizationGrant[] = []
    let actor: OrganizationGrant | undefined
    const seenCursors = new Set<string>()
    let resetUsed = false
    for (let page = 0; page < 20; page += 1) {
      const outcome = await request((ctx, signal) => adminGateway.listOrganizationGrants(organizationId, ctx, signal, cursor === undefined ? {} : { cursor }))
      if (outcome.kind === 'stale') return
      if (outcome.kind === 'failed') {
        if (outcome.error instanceof GatewayError && outcome.error.code === 'cursor_invalid' && cursor !== undefined && !resetUsed) {
          resetUsed = true; cursor = undefined; grants.length = 0; actor = undefined; seenCursors.clear(); continue
        }
        setView({ status: isDenied(outcome.error) ? 'denied' : 'error' }); return
      }
      if (outcome.value.context_id !== session?.context_id || outcome.value.authorization_version !== session?.authorization_version) {
        setView({ status: 'error' }); return
      }
      const pageActor = outcome.value.actor
      if (!actorId || !validActorProjection(organizationId, actorId, pageActor, actor)) { setView({ status: 'error' }); return }
      actor = pageActor
      grants.push(...outcome.value.items)
      if (!validGrantProjection(organizationId, grants) || grants.some((grant) => grant.user_id === actorId &&
        (grant.role !== pageActor.role || grant.revision !== pageActor.revision))) { setView({ status: 'error' }); return }
      const next = outcome.value.next_cursor
      if (next === null) { setView({ status: 'ready', value: { actor, grants } }); return }
      if (seenCursors.has(next)) { setView({ status: 'error' }); return }
      seenCursors.add(next)
      cursor = next
    }
    setView({ status: 'error' })
  }, [adminGateway, organizationId, actorId, request, session?.context_id, session?.authorization_version])
  const loadRoster = useCallback(async () => {
    if (!organizationId) return
    setRoster({ status: 'loading' })
    let cursor: string | undefined
    const items: z.infer<typeof RosterPersonSchema>[] = []
    const cursors = new Set<string>()
    for (let page = 0; page < 3; page += 1) {
      const outcome = await request((ctx, signal) => adminGateway.getOrganizationRoster(organizationId, ctx, signal, cursor === undefined ? {} : { cursor }))
      if (outcome.kind === 'stale') return
      if (outcome.kind === 'failed') { setRoster({ status: isDenied(outcome.error) ? 'unavailable' : 'error' }); return }
      if (outcome.value.context_id !== session?.context_id || outcome.value.authorization_version !== session?.authorization_version) {
        setRoster({ status: 'error' }); return
      }
      items.push(...outcome.value.items)
      const next = outcome.value.next_cursor
      if (next === null) { setRoster(validRosterProjection(items) ? { status: 'ready', items } : { status: 'error' }); return }
      if (cursors.has(next)) { setRoster({ status: 'error' }); return }
      cursors.add(next)
      cursor = next
    }
    setRoster({ status: 'error' })
  }, [adminGateway, organizationId, request, session?.context_id, session?.authorization_version])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadRoster() }, [loadRoster])

  const change = async (target: OrganizationGrant) => {
    if (view.status !== 'ready' || !organizationId || !proof || pending || writeBlocked) return
    const allowed = editableRoles(view.value.actor, target)
    const role = selection[target.user_id]
    if (!role || !allowed.includes(role)) return
    const revision = target.revision
    setPending(target.user_id)
    setNotice(null)
    const outcome = await request((ctx, signal) => adminGateway.replaceOrganizationGrant(organizationId, target.user_id, { role, expected_revision: revision }, ctx, proof, signal))
    setPending(null)
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed') {
      setWriteBlocked(true)
      // A stale revision or uncertain transport result must never silently replay a role write.
      if (outcome.error instanceof GatewayError && outcome.error.kind === 'api' && outcome.error.status === 409) setNotice('The grant revision changed. Reload current permissions before another change.')
      else if (isDenied(outcome.error)) setNotice('This grant is unavailable to you now.')
      else setNotice('The change was not confirmed. Reload current permissions before another change.')
      return
    }
    // The server returns only the changed grant; freeze controls until session and full projection reload.
    setWriteBlocked(true)
    setNotice('Change recorded. Reloading current permissions and audit revision.')
    refresh()
  }

  const title = section === 'people' ? 'People' : 'Organization settings'
  const subtitle = section === 'people' ? 'Who is in this workspace and what they may administer' : 'Organization grants and the settings this build exposes'
  const selectClass = 'h-8 rounded-lg border border-line border-b-line bg-surface px-2 text-sm text-fg shadow-xs   '
  return <section aria-label={title}>
    {section === 'people' ? <PageHeader title={title} subtitle={subtitle} /> : <div className="mb-6"><Heading as="h2" size="lg">{title}</Heading><Subheading>{subtitle}</Subheading></div>}
    <Callout variant="neutral" className="mb-6">Organization administration does not grant mailbox content access. Reading and sending mail require current mailbox permission.</Callout>
    {section === 'organization' && <Card className="mb-6"><h2 className="text-base font-medium text-fg ">Available settings</h2><p className="mt-1 text-sm text-muted">Current organization grants can be reviewed here. Provider, DNS, live delivery and credential settings are unavailable in this build.</p></Card>}

    <SectionHeader title="Configuration identities" subtitle="These twelve references are unbound. Their proposed roles are planning metadata, not active permissions, accounts, invitations or logins." />
    {roster.status === 'loading' && <p role="status" className="mb-3 text-xs text-muted">Checking organization roster…</p>}
    {roster.status === 'ready' && <p className="mb-3 text-xs text-muted">Unbound roster verified with the organization gateway.</p>}
    {roster.status === 'unavailable' && <p className="mb-3 text-xs text-muted">Organization roster unavailable; the reference list below is local configuration only.</p>}
    {roster.status === 'error' && <p role="alert" className="mb-3 text-xs text-danger">Organization roster could not be verified; the reference list below is local configuration only.</p>}
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {CONFIG_PEOPLE.map((person) => <li key={person.key} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm shadow-xs  ">
        <Avatar name={person.display_name} shape="circle" />
        <div className="min-w-0">
          <p className="font-medium text-fg ">{person.display_name}</p>
          <p className="text-xs text-muted">{person.title}{person.department ? ` · ${person.department}` : ''}</p>
          <p className="mt-2 text-xs text-fg ">Unbound · no email or login</p>
          <p className="text-xs text-muted">Proposed: {person.proposed_org_role.replaceAll('_', ' ')}</p>
        </div>
      </li>)}
    </ul>

    <SectionHeader title="Current organization grants" subtitle="Only the server's redacted active grants appear below. User IDs are opaque; this build has no verified person directory." />
    {view.status === 'loading' && <div role="status" aria-label="Loading current grants"><Skeleton rows={3} /></div>}
    {view.status === 'denied' && <EmptyState icon={<ShieldCheckIcon className="size-5" />} title="Administration unavailable" body="The organization or your access to its grants is unavailable." />}
    {view.status === 'error' && <ErrorState title="Current grants could not be loaded" body="No current permission state is shown." action={<Button variant="primary" onClick={() => void load()}>Try again</Button>} />}
    {notice && <div className="mb-4"><Callout variant="warning" role="alert">{notice}</Callout></div>}
    {view.status === 'ready' && <>
      <p className="mb-3 text-xs text-muted">Current grants loaded · audit event details unavailable in this build</p>
      {view.value.grants.length === 0 && <p className="mb-3 text-sm text-muted">No current grants were returned.</p>}
      <Card className="p-0">
        <ul className="divide-y divide-line ">
          {view.value.grants.map((grant) => {
            const roles = editableRoles(view.value.actor, grant)
            const selected = selection[grant.user_id] ?? grant.role
            {/* basis-full below sm: the UUID/role text owns the first line at 390px; controls wrap under it. */}
            return <li key={grant.user_id} className="flex flex-wrap items-center gap-3 px-6 py-4 text-sm">
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto"><p className="break-all font-mono text-xs text-fg ">{grant.user_id}</p><p className="text-xs text-muted">Current: {grant.role.replaceAll('_', ' ')} · revision {grant.revision}</p></div>
              {roles.length > 0 && <><label className="text-xs text-muted">Role <select aria-label={`Role for ${grant.user_id}`} className={`ms-1 ${selectClass}`} disabled={pending !== null || writeBlocked} value={selected} onChange={(event) => { const role = roles.find((candidate) => candidate === event.target.value); if (role) setSelection((before) => ({ ...before, [grant.user_id]: role })) }}>{[grant.role, ...roles.filter((role) => role !== grant.role)].map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}</select></label><Button size="sm" disabled={pending !== null || writeBlocked || selected === grant.role} onClick={() => void change(grant)}>Save role</Button></>}
            </li>
          })}
        </ul>
      </Card>
      <Button className="mt-4" onClick={() => void load()} disabled={pending !== null}>Reload grants</Button>
    </>}
  </section>
}
