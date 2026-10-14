// Responsive shell: skip link, sidebar as a drawer below the md breakpoint, labelled main region.
// FE-805: the rail carries independent Personal/Outreach sections fed by the validated feature
// registry (./features); the drawer keeps its "Mailboxes" name and trigger label because the
// existing e2e/read.spec.ts (QA-owned) and the R12/R19 visual evidence depend on them.
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
import { SignInPage } from '@/features/auth/SignInPage'
import { Badge } from '@/ui/Badge'
import { BrandMark } from '@/ui/BrandMark'
import { Button } from '@/ui/Button'
import { Drawer } from '@/ui/Drawer'
import { EmptyState, Skeleton } from '@/ui/Async'
import { IconButton } from '@/ui/Button'
import { MenuIcon } from '@/ui/icons'
import { AccountSheet } from './AccountSheet'
import { featureRegistry } from './features'
import { MailboxesProvider, type MailboxesSnapshot } from './mailboxes'
import { SearchBox } from './SearchBox'
import { Sidebar } from './Sidebar'
import { sessionIdentityKey, useGateway, useSession } from './session'

const FOOTNOTE = 'Simulated local data; drafts and notes stay on this installation. No mail is sent or received.'

type MailboxState = { status: 'loading' } | { status: 'ready'; mailboxes: Mailbox[] } | { status: 'error'; message: string }

export function Shell() {
  const { state: sessionState, refresh, signOut } = useSession()
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
  if (sessionState.status === 'refreshing') {
    // One bounded challenge+refresh after a 401: nothing protected is shown meanwhile (BE-02A).
    return (
      <div role="status" aria-label="Restoring access" className="mx-auto max-w-lg p-8">
        <Skeleton rows={4} />
      </div>
    )
  }
  if (sessionState.status === 'signing_out') {
    return (
      <div role="status" aria-label="Signing out" className="mx-auto max-w-lg p-8">
        <Skeleton rows={4} />
      </div>
    )
  }
  if (sessionState.status === 'unauthenticated') {
    // Nothing from a previous session is kept on this screen; the page owns only its own fields.
    return <SignInPage />
  }
  if (sessionState.status === 'no_organization') {
    return (
      <main className="mx-auto max-w-lg p-8">
        <EmptyState
          title="No organization is available"
          body="You are signed in, but this account is not a member of any organization yet. Ask an administrator to add you, then check again. Nothing is shown until a membership exists."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={refresh}>Check again</Button>
              <Button onClick={() => void signOut('local')}>Sign out</Button>
            </div>
          }
        />
      </main>
    )
  }
  if (sessionState.status === 'sign_out_failed') {
    return (
      <main role="alert" className="mx-auto max-w-lg p-8">
        <EmptyState
          title="Sign-out was not confirmed"
          body={`${sessionState.message} Your mail stays hidden on this screen until sign-out succeeds or you return to it.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => void signOut('local')}>Try signing out again</Button>
              <Button onClick={refresh}>Return to mail</Button>
            </div>
          }
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

  // Pages read capabilities from this snapshot (display hints only; the server stays authoritative).
  const mailboxesSnapshot: MailboxesSnapshot =
    mailboxState.status === 'ready' ? { status: 'ready', mailboxes: mailboxState.mailboxes } : mailboxState.status === 'loading' ? { status: 'loading' } : { status: 'error' }

  const sidebar =
    mailboxState.status === 'loading' ? (
      <div role="status" aria-label="Loading mailboxes"><Skeleton rows={4} /></div>
    ) : mailboxState.status === 'error' ? (
      <div role="alert" className="p-3">
        <p className="text-[13px] text-muted">{mailboxState.message}</p>
        <Button size="sm" className="mt-2" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
      </div>
    ) : (
      <Sidebar
        mailboxes={mailboxState.mailboxes}
        sections={featureRegistry.navBySection}
        onNavigate={closeDrawer}
        footnote={FOOTNOTE}
      />
    )

  return (
    <MailboxesProvider value={mailboxesSnapshot}>
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
          {/* Below md the rail (and its brand header) is hidden, so the authentic mark moves here. */}
          <BrandMark size={24} className="md:hidden" />
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold">{session.organization.name}</span>
            <span className="text-muted"> · {session.actor.display_name ?? 'Unnamed user'}</span>
          </p>
          {/* Below sm the header has no room for the form; the sidebar's Search link covers it. */}
          <span className="ml-auto hidden sm:block"><SearchBox /></span>
          {/* Local-mode indicator: simulated transport must be unmistakable. */}
          <Badge tone="warn" className="ml-auto sm:ml-0">Simulated local mail</Badge>
          <AccountSheet session={session} />
        </header>
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </MailboxesProvider>
  )
}
