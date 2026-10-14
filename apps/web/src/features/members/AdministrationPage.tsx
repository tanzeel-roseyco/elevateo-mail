import { useCallback, useEffect, useState } from 'react'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useSession } from '@/app/session'
import { RosterPersonSchema, type OrganizationGrant } from '@/data/v2Contract'
import type { z } from 'zod'
import { createV2Gateway } from '@/data/v2Gateway'
import { GatewayError } from '@/data/errors'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'
import { CONFIG_PEOPLE, editableRoles, validGrantProjection, validRosterProjection, type EditableRole } from './adminModel'

type Grants = { grants: OrganizationGrant[] }
type Roster = { status: 'loading' } | { status: 'ready'; items: z.infer<typeof RosterPersonSchema>[] } | { status: 'unavailable' } | { status: 'error' }
type View = { status: 'loading' } | { status: 'ready'; value: Grants } | { status: 'denied' } | { status: 'error' }
const adminGateway = createV2Gateway()

function isDenied(error: unknown): boolean {
  return error instanceof GatewayError && error.kind === 'api' && (error.status === 403 || error.status === 404 || error.code === 'not_available')
}

/** Additive V2 administration; no configuration key ever enters a grant mutation. */
export function AdministrationPage({ section }: { section: 'people' | 'organization' }) {
  const { state, refresh } = useSession()
  const { request, proof } = useProtectedRequest()
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
    const seenCursors = new Set<string>()
    let resetUsed = false
    for (let page = 0; page < 20; page += 1) {
      const outcome = await request((ctx, signal) => adminGateway.listOrganizationGrants(organizationId, ctx, signal, cursor === undefined ? {} : { cursor }))
      if (outcome.kind === 'stale') return
      if (outcome.kind === 'failed') {
        if (outcome.error instanceof GatewayError && outcome.error.code === 'cursor_invalid' && cursor !== undefined && !resetUsed) {
          resetUsed = true; cursor = undefined; grants.length = 0; seenCursors.clear(); continue
        }
        setView({ status: isDenied(outcome.error) ? 'denied' : 'error' }); return
      }
      if (outcome.value.context_id !== session?.context_id || outcome.value.authorization_version !== session?.authorization_version) {
        setView({ status: 'error' }); return
      }
      grants.push(...outcome.value.items)
      if (!validGrantProjection(organizationId, grants)) { setView({ status: 'error' }); return }
      const next = outcome.value.next_cursor
      if (next === null) { setView({ status: 'ready', value: { grants } }); return }
      if (seenCursors.has(next)) { setView({ status: 'error' }); return }
      seenCursors.add(next)
      cursor = next
    }
    setView({ status: 'error' })
  }, [organizationId, request, session?.context_id, session?.authorization_version])
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
  }, [organizationId, request, session?.context_id, session?.authorization_version])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadRoster() }, [loadRoster])

  const change = async (target: OrganizationGrant) => {
    if (view.status !== 'ready' || !organizationId || !actorId || !proof || pending || writeBlocked) return
    const allowed = editableRoles(actorId, view.value.grants, target)
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
    // The server returns only the changed grant; reload the whole redacted projection and actor authority.
    setNotice('Change recorded. Reloading current permissions and audit revision.')
    refresh()
  }

  const title = section === 'people' ? 'People' : 'Organization settings'
  return <section className="mx-auto max-w-4xl p-4" aria-label={title}>
    <h1 className="text-xl font-semibold">{title}</h1>
    <p className="mt-2 text-sm text-muted">Organization administration does not grant mailbox content access. Reading and sending mail require current mailbox permission.</p>
    {section === 'organization' && <div className="mt-4 rounded-lg border border-line p-4"><h2 className="font-semibold">Available settings</h2><p className="mt-1 text-sm text-muted">Current organization grants can be reviewed here. Provider, DNS, live delivery and credential settings are unavailable in this build.</p></div>}
    <h2 className="mt-5 font-semibold">Configuration identities</h2>
    <p className="mt-1 text-sm text-muted">These twelve references are unbound. Their proposed roles are planning metadata, not active permissions, accounts, invitations or logins.</p>
    {roster.status === 'loading' && <p role="status" className="mt-1 text-xs text-muted">Checking organization roster…</p>}
    {roster.status === 'ready' && <p className="mt-1 text-xs text-muted">Unbound roster verified with the organization gateway.</p>}
    {roster.status === 'unavailable' && <p className="mt-1 text-xs text-muted">Organization roster unavailable; the reference list below is local configuration only.</p>}
    {roster.status === 'error' && <p role="alert" className="mt-1 text-xs">Organization roster could not be verified; the reference list below is local configuration only.</p>}
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {CONFIG_PEOPLE.map((person) => <li key={person.key} className="rounded-lg border border-line p-3 text-sm"><p className="font-medium">{person.display_name}</p><p className="text-xs text-muted">{person.title}{person.department ? ` · ${person.department}` : ''}</p><p className="mt-1 text-xs">Unbound · no email or login</p><p className="text-xs text-muted">Proposed: {person.proposed_org_role.replaceAll('_', ' ')}</p></li>)}
    </ul>
    <h2 className="mt-6 font-semibold">Current organization grants</h2>
    <p className="mt-1 text-sm text-muted">Only the server's redacted active grants appear below. User IDs are opaque; this build has no verified person directory.</p>
    {view.status === 'loading' && <div role="status" aria-label="Loading current grants"><Skeleton rows={3} /></div>}
    {view.status === 'denied' && <EmptyState title="Administration unavailable" body="The organization or your access to its grants is unavailable." />}
    {view.status === 'error' && <EmptyState title="Current grants could not be loaded" body="No current permission state is shown." action={<Button onClick={() => void load()}>Try again</Button>} />}
    {notice && <p role="alert" className="mt-3 text-sm">{notice}</p>}
    {view.status === 'ready' && <>
      <p className="mt-2 text-xs text-muted">Current grants loaded · audit event details unavailable in this build</p>
      {view.value.grants.length === 0 && <p className="mt-3 text-sm text-muted">No current grants were returned.</p>}
      <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
        {view.value.grants.map((grant) => {
          const roles = actorId ? editableRoles(actorId, view.value.grants, grant) : []
          const selected = selection[grant.user_id] ?? grant.role
          return <li key={grant.user_id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1"><p className="break-all font-mono text-xs">{grant.user_id}</p><p className="text-xs text-muted">Current: {grant.role.replaceAll('_', ' ')} · revision {grant.revision}</p></div>
            {roles.length > 0 && <><label className="text-xs">Role <select aria-label={`Role for ${grant.user_id}`} className="ml-1 rounded border border-line bg-surface p-1" disabled={pending !== null || writeBlocked} value={selected} onChange={(event) => { const role = roles.find((candidate) => candidate === event.target.value); if (role) setSelection((before) => ({ ...before, [grant.user_id]: role })) }}>{[grant.role, ...roles.filter((role) => role !== grant.role)].map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}</select></label><Button disabled={pending !== null || writeBlocked || selected === grant.role} onClick={() => void change(grant)}>Save role</Button></>}
          </li>
        })}
      </ul>
      <Button className="mt-3" onClick={() => void load()} disabled={pending !== null}>Reload grants</Button>
    </>}
  </section>
}
