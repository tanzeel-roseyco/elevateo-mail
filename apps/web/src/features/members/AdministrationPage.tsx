import { useCallback, useEffect, useState } from 'react'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useSession } from '@/app/session'
import { GatewayError } from '@/data/errors'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'
import { CONFIG_PEOPLE, type AdminSnapshot, type AdminGateway, type Person, validateAdminSnapshot } from './adminModel'

type View = { status: 'loading' } | { status: 'ready'; snapshot: AdminSnapshot } | { status: 'unavailable' } | { status: 'error' }

/** Fable routes both /people and /settings here, supplying Cassian's validated V2 adapter. */
export function AdministrationPage({ gateway, section }: { gateway: AdminGateway; section: 'people' | 'settings' }) {
  const { request, proof } = useProtectedRequest()
  const { refresh } = useSession()
  const [view, setView] = useState<View>({ status: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setView({ status: 'loading' })
    setNotice(null)
    const result = await request((ctx, signal) => gateway.listOrganizationGrants(ctx, signal))
    if (result.kind === 'stale') return
    if (result.kind === 'failed') {
      setView(result.error instanceof GatewayError && result.error.kind === 'api' && result.error.code === 'not_available' ? { status: 'unavailable' } : { status: 'error' })
      return
    }
    try { setView({ status: 'ready', snapshot: validateAdminSnapshot(result.value) }) }
    catch { setView({ status: 'error' }) }
  }, [gateway, request])
  useEffect(() => { void load() }, [load])

  const changeRole = async (person: Person, role: Person['proposed_org_role']) => {
    if (view.status !== 'ready' || !view.snapshot.can_manage_grants || !proof || busy) return
    // A configuration identity is never an Auth subject. The control cannot bind an unbound row.
    if (person.enrollment_state === 'unbound') { setNotice('This identity is unbound. A verified enrollment is required before a grant can be changed.'); return }
    setBusy(true)
    setNotice(null)
    const result = await request((ctx, signal) => gateway.replaceOrganizationGrant(ctx, proof, person.key, role, view.snapshot.revision, signal))
    setBusy(false)
    if (result.kind === 'stale') return
    if (result.kind === 'failed') {
      if (result.error instanceof GatewayError && result.error.kind === 'api' && result.error.status === 409) {
        setNotice('The grant revision changed. Reload current permissions before trying again.')
      } else if (result.error instanceof GatewayError && result.error.kind === 'api' && result.error.code === 'not_available') {
        setNotice('You cannot change this grant, or this person is unavailable.')
      } else setNotice('The change was not confirmed. Reload current permissions before trying again.')
      return
    }
    try { setView({ status: 'ready', snapshot: validateAdminSnapshot(result.value) }) }
    catch { setView({ status: 'error' }); return }
    refresh()
  }

  return <section className="mx-auto max-w-4xl p-4" aria-label={section === 'people' ? 'People' : 'Settings'}>
    <h1 className="text-xl font-semibold">{section === 'people' ? 'People' : 'Settings'}</h1>
    <p className="mt-2 text-sm text-muted">Organization administration does not grant mailbox content access. Mailbox reading and sending require current mailbox permission.</p>
    {section === 'settings' && <div className="mt-4 rounded-lg border border-line p-4"><h2 className="font-semibold">Available settings</h2><p className="mt-1 text-sm text-muted">This build supports viewing organization people and current grants. Mail delivery, provider, DNS and credential settings are unavailable here.</p></div>}
    {view.status === 'loading' && <div role="status" aria-label="Loading administration"><Skeleton rows={4} /></div>}
    {view.status === 'unavailable' && <EmptyState title="Administration unavailable" body="This organization or your administrative access may be unavailable." />}
    {view.status === 'error' && <EmptyState title="Administration could not be loaded" body="Current permissions could not be verified." action={<Button onClick={() => void load()}>Try again</Button>} />}
    {notice && <p role="alert" className="mt-3 text-sm">{notice}</p>}
    {view.status === 'ready' && <>
      <div className="mt-4 flex items-center justify-between"><h2 className="font-semibold">Configuration identities</h2><span className="text-xs text-muted">Revision {view.snapshot.revision}</span></div>
      <p className="mt-1 text-sm text-muted">The twelve reference people are unbound. Names and proposed roles are configuration only; no email, login, invitation or mailbox grant exists from these entries.</p>
      <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
        {CONFIG_PEOPLE.map((person) => {
          const current = view.snapshot.grants.find((grant) => grant.person_key === person.key)
          return <li key={person.key} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="min-w-40 flex-1"><p className="font-medium">{person.display_name}</p><p className="text-xs text-muted">{person.title}{person.department ? ` · ${person.department}` : ''}</p></div>
            <div className="text-xs"><p>Unbound · no email or login</p><p>Proposed: {person.proposed_org_role.replaceAll('_', ' ')}</p><p>Current grant: {current ? current.role.replaceAll('_', ' ') : 'none'}</p></div>
            {current && view.snapshot.can_manage_grants && <Button disabled={busy} onClick={() => void changeRole(person, person.proposed_org_role)}>Review grant</Button>}
          </li>
        })}
      </ul>
    </>}
  </section>
}
