// Responsive shell: skip link, sidebar as a drawer below the md breakpoint, labelled main region.
// Layout ideas adapted from first-party Ledger frontend 4322cfbb, src/features/live/LiveShell.tsx
// (blob 2633baf7…); session/capability wiring replaced with the FE-01 session controller.
//
// AIDEV-NOTE: The gate renders no protected subtree while non-ready, and ProtectedShell is keyed
// by sessionIdentityKey, so a replaced identity's first committed render starts from fresh mailbox,
// drawer and routed state — clearing state in a passive effect would be too late (D3, FE-R05).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router'
import type { Mailbox, MailboxPage, Session } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { newTraversalBudget, readPage } from '@/lib/readPage'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Drawer } from '@/ui/Drawer'
import { EmptyState, Skeleton } from '@/ui/Async'
import { IconButton } from '@/ui/Button'
import { MenuIcon } from '@/ui/icons'
import { Sidebar } from './Sidebar'
import { sessionIdentityKey, useGateway, useSession } from './session'

const FOOTNOTE = 'Read-only checkpoint. Simulated local data; no mail is sent or received.'

type MailboxState = { status: 'loading' } | { status: 'ready'; mailboxes: Mailbox[] } | { status: 'error'; message: string }

export function Shell() {
  const { state: sessionState, refresh } = useSession()
  // Tracks the previously committed identity so only an actual replacement moves focus (D3).
  const lastIdentityRef = useRef<string | null>(null)
  const identity = sessionState.status === 'ready' ? sessionIdentityKey(sessionState.session) : null
  useEffect(() => {
    if (identity !== null) lastIdentityRef.current = identity
  }, [identity])

  if (sessionState.status === 'loading') {
    return (
      <div role="status" aria-label="Loading session" className="mx-auto max-w-lg p-8">
        <Skeleton rows={4} />
      </div>
    )
  }
  if (sessionState.status === 'recovering') {
    // One-time automatic context recovery: protected content stays hidden meanwhile (D2).
    return (
      <div role="status" aria-label="Restoring session" className="mx-auto max-w-lg p-8">
        <Skeleton rows={4} />
      </div>
    )
  }
  if (sessionState.status === 'retry_required') {
    return (
      <main role="alert" className="mx-auto max-w-lg p-8">
        <EmptyState
          title="Your access changed again"
          body="The session was restored once already, but your access changed a second time. Nothing stale is shown; retry to load your current session."
          action={<Button variant="primary" onClick={refresh}>Try again</Button>}
        />
      </main>
    )
  }
  if (sessionState.status === 'unauthenticated') {
    return (
      <main className="mx-auto max-w-lg p-8">
        <EmptyState
          title="Your session is unavailable"
          body="You are signed out or your session expired. Nothing from the previous session is kept on this screen. Sign-in is not part of this checkpoint; retry once a session exists."
          action={<Button variant="primary" onClick={refresh}>Check again</Button>}
        />
      </main>
    )
  }
  if (sessionState.status === 'error') {
    return (
      <main role="alert" className="mx-auto max-w-lg p-8">
        <EmptyState title="The session could not be loaded" body={sessionState.message} action={<Button variant="primary" onClick={refresh}>Try again</Button>} />
      </main>
    )
  }

  const replacedIdentity = lastIdentityRef.current !== null && lastIdentityRef.current !== identity
  return <ProtectedShell key={identity} session={sessionState.session} replacedIdentity={replacedIdentity} />
}

function ProtectedShell({ session, replacedIdentity }: { session: Session; replacedIdentity: boolean }) {
  const gateway = useGateway()
  const { scope, context, handleError } = useSession()
  const [mailboxState, setMailboxState] = useState<MailboxState>({ status: 'loading' })
  // Explicit "Try again" bumps this nonce: a fresh traversal with a fresh one-reset budget (D4).
  const [attempt, setAttempt] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    if (!context) return
    const generation = scope.current()
    const controller = new AbortController()
    const isCurrent = () => scope.isCurrent(generation) && !controller.signal.aborted
    setMailboxState({ status: 'loading' })
    const loadAll = async () => {
      // getMailboxes is the sole capability list; follow continuation cursors to completion.
      // AIDEV-NOTE: One reset budget covers the entire loop, including pages after a reset; the
      // per-page helper cannot secretly grant a fresh budget (D4, FE-R07).
      const budget = newTraversalBudget()
      let mailboxes: Mailbox[] = []
      const seen = new Set<string>()
      let cursor: string | undefined
      do {
        const outcome = await readPage<MailboxPage>({
          read: (c) => gateway.listMailboxes(context, c === undefined ? {} : { cursor: c }, controller.signal),
          cursor,
          budget,
          isCurrent,
        })
        if (outcome.kind === 'stale') return
        if (outcome.kind === 'failed') {
          if (!isCurrent() || handleError(outcome.error, generation)) return
          setMailboxState({
            status: 'error',
            message: outcome.error instanceof GatewayError ? outcome.error.message : 'Mailboxes could not be loaded.',
          })
          return
        }
        if (outcome.replace) {
          // A reset restarted from page one: discard everything accumulated before it (D4).
          mailboxes = []
          seen.clear()
        }
        for (const mailbox of outcome.page.items) {
          if (!seen.has(mailbox.id)) {
            seen.add(mailbox.id)
            mailboxes.push(mailbox)
          }
        }
        cursor = outcome.page.next_cursor ?? undefined
      } while (cursor !== undefined)
      if (!isCurrent()) return
      setMailboxState({ status: 'ready', mailboxes })
    }
    void loadAll()
    return () => controller.abort()
  }, [gateway, context, scope, handleError, attempt])

  // An identity replacement may remove the element that previously held focus (e.g. the drawer
  // trigger); land on the surviving main region instead of letting focus fall to <body> (D3).
  useEffect(() => {
    // Effectively mount-only: this keyed subtree exists once per identity, and the prop can only
    // flip to false afterwards, which is a no-op.
    if (replacedIdentity) document.getElementById('main')?.focus()
  }, [replacedIdentity])

  // Growing past the md breakpoint removes the drawer presentation; close the dialog so no
  // invisible modal keeps trapping desktop interaction (D6, FE-R06).
  useEffect(() => {
    if (!drawerOpen) return
    const media = window.matchMedia('(min-width: 768px)')
    if (media.matches) {
      setDrawerOpen(false)
      return
    }
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setDrawerOpen(false)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [drawerOpen])

  const sidebar =
    mailboxState.status === 'loading' ? (
      <div role="status" aria-label="Loading mailboxes"><Skeleton rows={4} /></div>
    ) : mailboxState.status === 'error' ? (
      <div role="alert" className="p-3">
        <p className="text-[13px] text-muted">{mailboxState.message}</p>
        <Button size="sm" className="mt-2" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
      </div>
    ) : (
      <Sidebar mailboxes={mailboxState.mailboxes} onNavigate={closeDrawer} footnote={FOOTNOTE} />
    )

  return (
    <div className="flex h-full min-h-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-20 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface md:block">{sidebar}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <span className="md:hidden">
            <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Mailboxes" trigger={<IconButton label="Open mailbox menu"><MenuIcon /></IconButton>}>
              {sidebar}
            </Drawer>
          </span>
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold">{session.organization.name}</span>
            <span className="text-muted"> · {session.actor.display_name ?? 'Unnamed user'}</span>
          </p>
          {/* Local-mode indicator: simulated transport must be unmistakable. */}
          <Badge tone="warn" className="ml-auto">Simulated local mail</Badge>
        </header>
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
