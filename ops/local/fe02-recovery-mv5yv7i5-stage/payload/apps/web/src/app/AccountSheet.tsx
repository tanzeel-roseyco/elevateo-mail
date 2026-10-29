// Current-session controls (BE-02A): who is signed in, explicit organization switch and local or
// global sign-out. Lives inside the keyed protected subtree, so a replaced identity starts with a
// closed sheet and no stale organization list (D3). The organization list is read only while the
// sheet is open and follows cursors with one bounded traversal.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActionFailure, ActionResult } from './actionFailure'
import type { Organization, OrganizationPage, Session } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { newTraversalBudget, readPage } from '@/lib/readPage'
import { Button, IconButton } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import { Skeleton } from '@/ui/Async'
import { UserIcon } from '@/ui/icons'
import { useGateway, useSession } from './session'

/** Own memberships are few (ten-person product); this bound keeps memory and requests finite. */
export const MAX_ORGANIZATION_PAGES = 20

type OrganizationsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; items: Organization[]; incomplete: boolean }
  | { status: 'error'; message: string }

type Pending = { action: 'switch'; organizationId: string } | { action: 'sign_out'; scope: 'local' | 'global' } | null

export function AccountSheet({ session }: { session: Session }) {
  const gateway = useGateway()
  const { scope, context, handleError, switchOrganization, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const [organizations, setOrganizations] = useState<OrganizationsState>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState<Pending>(null)
  const [failure, setFailure] = useState<ActionFailure | null>(null)
  // A result from an action started under an earlier open/close cycle must not touch the sheet.
  const actionTokenRef = useRef(0)

  useEffect(() => {
    if (!open || !context) return
    const generation = scope.current()
    const controller = new AbortController()
    const isCurrent = () => scope.isCurrent(generation) && !controller.signal.aborted
    setOrganizations({ status: 'loading' })
    const loadAll = async () => {
      // AIDEV-NOTE: One reset budget for the whole traversal (D4); pages are bounded so a server
      // that keeps returning cursors cannot grow memory without limit. 'incomplete' is shown honestly.
      const budget = newTraversalBudget()
      let items: Organization[] = []
      const seen = new Set<string>()
      let cursor: string | undefined
      let pages = 0
      do {
        const outcome = await readPage<OrganizationPage>({
          read: (c) => gateway.listOrganizations(context, c === undefined ? {} : { cursor: c }, controller.signal),
          cursor,
          budget,
          isCurrent,
        })
        if (outcome.kind === 'stale') return
        if (outcome.kind === 'failed') {
          if (!isCurrent() || handleError(outcome.error, generation)) return
          setOrganizations({ status: 'error', message: outcome.error instanceof GatewayError ? outcome.error.message : 'Organizations could not be loaded.' })
          return
        }
        if (outcome.replace) {
          items = []
          seen.clear()
        }
        for (const organization of outcome.page.items) {
          if (!seen.has(organization.id)) {
            seen.add(organization.id)
            items.push(organization)
          }
        }
        cursor = outcome.page.next_cursor ?? undefined
        pages += 1
      } while (cursor !== undefined && pages < MAX_ORGANIZATION_PAGES)
      if (!isCurrent()) return
      setOrganizations({ status: 'ready', items, incomplete: cursor !== undefined })
    }
    void loadAll()
    return () => controller.abort()
  }, [open, context, gateway, scope, handleError, attempt])

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) {
      actionTokenRef.current += 1
      setPending(null)
      setFailure(null)
      setOrganizations({ status: 'idle' })
    }
  }, [])

  const run = async (next: NonNullable<Pending>, work: () => Promise<ActionResult>) => {
    if (pending) return
    const token = ++actionTokenRef.current
    setPending(next)
    setFailure(null)
    const result = await work()
    if (actionTokenRef.current !== token) return
    setPending(null)
    if (result.kind === 'failed') setFailure(result.failure)
    // 'ok' replaces the identity (switch) or leaves the protected subtree (sign-out): this sheet
    // unmounts with it, so there is nothing further to render here.
  }

  const busy = pending !== null
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Account"
      trigger={<IconButton label="Account and sign-out"><UserIcon /></IconButton>}
    >
      <div className="flex flex-col gap-4 p-4">
        <dl className="text-sm">
          <dt className="eyebrow">Signed in as</dt>
          <dd className="truncate font-semibold">{session.actor.display_name ?? 'Unnamed user'}</dd>
          <dt className="eyebrow mt-2">Organization</dt>
          <dd className="truncate">{session.organization.name}</dd>
        </dl>

        <section aria-labelledby="organizations-heading" className="flex flex-col gap-1">
          <h3 id="organizations-heading" className="eyebrow">Switch organization</h3>
          {organizations.status === 'loading' || organizations.status === 'idle' ? (
            <div role="status" aria-label="Loading organizations"><Skeleton rows={2} /></div>
          ) : organizations.status === 'error' ? (
            <div role="alert">
              <p className="text-[13px] text-muted">{organizations.message}</p>
              <Button size="sm" className="mt-2" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {organizations.items.length === 0 && <li className="px-1 py-1 text-[13px] text-muted">No organizations are available to you.</li>}
              {organizations.items.map((organization) => {
                const current = organization.id === session.organization.id
                const switching = pending?.action === 'switch' && pending.organizationId === organization.id
                return (
                  <li key={organization.id}>
                    <button
                      type="button"
                      disabled={current || busy}
                      aria-current={current ? 'true' : undefined}
                      onClick={() => run({ action: 'switch', organizationId: organization.id }, () => switchOrganization(organization.id))}
                      className="flex h-9 w-full items-center justify-between rounded-lg px-2 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70 aria-[current=true]:bg-accent-soft aria-[current=true]:font-semibold aria-[current=true]:text-accent-text aria-[current=true]:opacity-100"
                    >
                      <span className="min-w-0 truncate">{organization.name}</span>
                      <span className="ml-2 shrink-0 text-[11px] text-muted">{current ? 'Current' : switching ? 'Switching…' : ''}</span>
                    </button>
                  </li>
                )
              })}
              {organizations.incomplete && <li className="px-1 py-1 text-[11px] text-muted">More organizations exist than are listed here.</li>}
            </ul>
          )}
        </section>

        {failure && (
          <p role="alert" className="text-[13px] text-danger">{failure.message}</p>
        )}

        <section aria-labelledby="sign-out-heading" className="flex flex-col gap-2">
          <h3 id="sign-out-heading" className="eyebrow">Sign out</h3>
          <Button variant="secondary" disabled={busy} onClick={() => run({ action: 'sign_out', scope: 'local' }, () => signOut('local'))}>
            {pending?.action === 'sign_out' && pending.scope === 'local' ? 'Signing out…' : 'Sign out'}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => run({ action: 'sign_out', scope: 'global' }, () => signOut('global'))}>
            {pending?.action === 'sign_out' && pending.scope === 'global' ? 'Signing out everywhere…' : 'Sign out everywhere'}
          </Button>
          <p className="text-[11px] leading-snug text-muted">“Everywhere” ends every session of this account on this installation. Identity-provider sign-out may complete later.</p>
        </section>
      </div>
    </Sheet>
  )
}
