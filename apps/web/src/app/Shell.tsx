// Application shell in the EmailGuard layout (DESIGN-SPEC §3–4): sticky sidebar at lg and above,
// a drawer plus mobile header below it, and a page-scrolling main region with p-6/lg:p-8 and a
// max-w-7xl content column. The session gate renders no protected subtree while non-ready.
// FE-805: the drawer is named "Navigation" / "Open navigation" as agreed with QA; e2e selectors
// depend on those names and on the "Simulated local mail" badge.
//
// AIDEV-NOTE: ProtectedShell is keyed by sessionIdentityKey, so a replaced identity's first
// committed render starts from fresh mailbox, drawer and routed state — clearing state in a
// passive effect would be too late (D3, FE-R05).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import type { Mailbox, MailboxPage, Session } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { newTraversalBudget, readPage } from '@/lib/readPage'
import { AssistantDock } from '@/features/assistant/AssistantPanel'
import { SignInPage } from '@/features/auth/SignInPage'
import { readSsoLandingError, stripSsoLandingError } from '@/data/ssoContract'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { useBottomNotice } from '@/ui/useBottomNotice'
import { BrandLockup } from '@/ui/BrandLockup'
import { Button, IconButton } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { ConnectivityBanner } from '@/ui/ConnectivityBanner'
import { Drawer } from '@/ui/Drawer'
import { Bars3Icon, ExclamationTriangleIcon, UserIcon } from '@/ui/icons'
import { ToastProvider } from '@/ui/Toast'
import { featureRegistry } from './features'
import { MailboxesProvider, type MailboxesSnapshot } from './mailboxes'
import { PageBoundary } from './PageBoundary'
import { Sidebar, type MailboxNavState } from './Sidebar'
import { useDesktopReady, useDesktopSignOut, useDesktopUpdateNotice } from './desktopHost'
import { sessionIdentityKey, useGateway, useSession } from './session'
import { UserMenu } from './UserMenu'

// AIDEV-NOTE: ADV033: the simulation label is derived from the server's authoritative session flag,
// never asserted unconditionally, and it must not promise local-only storage (drafts and notes are
// saved on the server; only mail transport is simulated).
const SIMULATION_FOOTNOTE = 'Simulation mode: no mail is sent or received. Drafts and notes are saved on the server.'

/** Desktop breakpoint at which the sidebar rail replaces the drawer (Tailwind `lg`). */
export const SIDEBAR_BREAKPOINT = '(min-width: 1024px)'

type MailboxState = { status: 'loading' } | { status: 'ready'; mailboxes: Mailbox[] } | { status: 'error'; message: string }

/** Centered frame for the gate screens (loading, sign-in problems, no organization). */
function GateFrame({ role, label, children }: { role: 'status' | 'alert' | 'main'; label?: string; children: ReactNode }) {
  const inner = <div className="mx-auto w-full max-w-lg px-6 py-16">{children}</div>
  if (role === 'main') return <main className="min-h-dvh">{inner}</main>
  return <div role={role} aria-label={label} className="min-h-dvh">{inner}</div>
}

export function Shell() {
  const { state: sessionState, refresh, signOut } = useSession()
  // Tracks the previously committed identity so only an actual replacement moves focus (D3).
  const lastIdentityRef = useRef<string | null>(null)
  const identity = sessionState.status === 'ready' ? sessionIdentityKey(sessionState.session) : null
  useEffect(() => {
    if (identity !== null) lastIdentityRef.current = identity
  }, [identity])
  // Desktop shell only: a signed-in screen proves the update healthy; the native Sign Out menu
  // runs the same local sign-out as the user menu (its failures surface the same way).
  useDesktopReady(identity !== null)
  const signOutLocally = useCallback(() => void signOut('local'), [signOut])
  useDesktopSignOut(signOutLocally)
  // AIDEV-NOTE: An SSO callback failure that lands on an already-signed-in browser must not sit in
  // the URL until a later sign-out shows it as a stale alert; drop it once the app renders.
  useEffect(() => {
    if (identity === null) return
    const search = window.location.search
    if (readSsoLandingError(search) === null) return
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${stripSsoLandingError(search)}${window.location.hash}`)
  }, [identity])

  if (sessionState.status === 'loading') {
    return <GateFrame role="status" label="Loading session"><Skeleton rows={4} /></GateFrame>
  }
  if (sessionState.status === 'recovering') {
    // One-time automatic context recovery: protected content stays hidden meanwhile (D2).
    return <GateFrame role="status" label="Restoring session"><Skeleton rows={4} /></GateFrame>
  }
  if (sessionState.status === 'retry_required') {
    return (
      <GateFrame role="alert">
        <EmptyState
          icon={<ExclamationTriangleIcon className="size-5" />}
          title="Your access changed again"
          body="The session was restored once already, but your access changed a second time. Retry to load your current session."
          action={<Button variant="primary" onClick={refresh}>Try again</Button>}
        />
      </GateFrame>
    )
  }
  if (sessionState.status === 'refreshing') {
    // One bounded challenge+refresh after a 401: nothing protected is shown meanwhile (BE-02A).
    return <GateFrame role="status" label="Restoring access"><Skeleton rows={4} /></GateFrame>
  }
  if (sessionState.status === 'signing_out') {
    return <GateFrame role="status" label="Signing out"><Skeleton rows={4} /></GateFrame>
  }
  if (sessionState.status === 'unauthenticated') {
    // Nothing from a previous session is kept on this screen; the page owns only its own fields.
    return <SignInPage />
  }
  if (sessionState.status === 'no_organization') {
    return (
      <GateFrame role="main">
        <EmptyState
          icon={<UserIcon className="size-5" />}
          title="No organization is available"
          body="You are signed in, but this account is not a member of any organization yet. Ask an administrator to add you, then check again."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={refresh}>Check again</Button>
              <Button onClick={() => void signOut('local')}>Sign out</Button>
            </div>
          }
        />
      </GateFrame>
    )
  }
  if (sessionState.status === 'sign_out_failed') {
    return (
      <GateFrame role="main">
        <ErrorState
          title="Sign-out was not confirmed"
          body={`${sessionState.message} Your mail stays hidden on this screen until sign-out succeeds or you return to it.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => void signOut('local')}>Try signing out again</Button>
              <Button onClick={refresh}>Return to mail</Button>
            </div>
          }
        />
      </GateFrame>
    )
  }
  if (sessionState.status === 'error') {
    return (
      <GateFrame role="main">
        <ErrorState title="The session could not be loaded" body={sessionState.message} action={<Button variant="primary" onClick={refresh}>Try again</Button>} />
      </GateFrame>
    )
  }

  const replacedIdentity = lastIdentityRef.current !== null && lastIdentityRef.current !== identity
  return <ProtectedShell key={identity} session={sessionState.session} replacedIdentity={replacedIdentity} />
}

function ProtectedShell({ session, replacedIdentity }: { session: Session; replacedIdentity: boolean }) {
  const updateNotice = useDesktopUpdateNotice()
  const gateway = useGateway()
  const { scope, context, handleError, refresh } = useSession()
  const { pathname } = useLocation()
  const [mailboxState, setMailboxState] = useState<MailboxState>({ status: 'loading' })
  // Explicit "Try again" bumps this nonce: a fresh traversal with a fresh one-reset budget (D4).
  const [attempt, setAttempt] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const retryMailboxes = useCallback(() => setAttempt((n) => n + 1), [])

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

  // Route change hygiene for small screens and WebViews (FE-805): scroll back to the top and,
  // only when focus is stranded on <body> (a removed element or a dismissed soft keyboard), move
  // it to the new page. Focus kept by a page (reader heading, editor field) or by Radix on the
  // drawer trigger is respected; e2e/read.spec.ts asserts the trigger case.
  // AIDEV-NOTE: Must not fire on mount: the identity-replacement effect above owns initial focus.
  const firstPathRef = useRef(pathname)
  useEffect(() => {
    if (firstPathRef.current === pathname) return
    firstPathRef.current = pathname
    const main = document.getElementById('main')
    if (!main) return
    window.scrollTo({ top: 0 })
    const active = document.activeElement
    if (active === null || active === document.body) main.focus({ preventScroll: true })
  }, [pathname])

  // Growing past the lg breakpoint removes the drawer presentation; close the dialog so no
  // invisible modal keeps trapping desktop interaction (D6, FE-R06).
  useEffect(() => {
    if (!drawerOpen) return
    const media = window.matchMedia(SIDEBAR_BREAKPOINT)
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
  const mailboxNav: MailboxNavState =
    mailboxState.status === 'ready'
      ? { status: 'ready', mailboxes: mailboxState.mailboxes }
      : mailboxState.status === 'loading'
        ? { status: 'loading' }
        : { status: 'error', message: mailboxState.message, retry: retryMailboxes }

  return (
    <MailboxesProvider value={mailboxesSnapshot}>
      <ToastProvider>
        <div className="flex min-h-dvh bg-surface ">
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-40 focus:rounded-lg focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
            Skip to content
          </a>
          <aside
            className={`sticky top-0 z-10 hidden max-h-[calc(100dvh-var(--bottom-notices))] shrink-0 flex-col overflow-y-auto overscroll-contain border-e border-line bg-surface-2 lg:flex   ${collapsed ? 'w-14' : 'w-66'}`}
          >
            <Sidebar
              session={session}
              mailboxes={mailboxNav}
              sections={featureRegistry.navBySection}
              collapsed={collapsed}
              onToggle={() => setCollapsed((c) => !c)}
            />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex min-h-14 items-center px-6 lg:hidden">
              {/* Names agreed with QA (ADV/Tessa): the drawer holds every section, not only mailboxes. */}
              <Drawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                title="Navigation"
                trigger={
                  <IconButton label="Open navigation" variant="subtle" size="md" className="-ms-2.5">
                    <Bars3Icon className="size-5" />
                  </IconButton>
                }
              >
                <Sidebar session={session} mailboxes={mailboxNav} sections={featureRegistry.navBySection} onNavigate={closeDrawer} inDrawer />
              </Drawer>
              <BrandLockup className="ms-2" />
              <div className="flex-1" />
              <UserMenu session={session} compact side="bottom" label="Account menu" />
            </header>
            {/* Online-only: no cache, no queue; a drop is announced and a return offers an explicit reload. */}
            <ConnectivityBanner onReload={refresh} />
            {updateNotice && (
              <Callout role="status" label="App update" variant={updateNotice.status === 'error' ? 'danger' : updateNotice.status === 'blocked_busy' ? 'warning' : 'neutral'} className="mx-6 mt-4 lg:mx-8">
                {updateNotice.message}
              </Callout>
            )}
            <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col p-6 pb-[calc(1.5rem+var(--bottom-notices))] lg:p-8 lg:pb-[calc(2rem+var(--bottom-notices))]">
              <div className="flex w-full max-w-7xl flex-1 flex-col">
                <PageBoundary><Outlet /></PageBoundary>
              </div>
            </main>
            {/* AIDEV-NOTE: SimulationNotice measures its shared inset for every docked control.
                AIDEV-TODO: Shared safe-area-aware inset implemented; retain browser zoom regression coverage. */}
            {session.simulation_mode && <SimulationNotice />}
          </div>
          {/* Desktop-host-only assistant (FC-MAC): renders nothing in a plain browser. */}
          <AssistantDock />
        </div>
      </ToastProvider>
    </MailboxesProvider>
  )
}

function SimulationNotice() {
  const ref = useBottomNotice('--simulation-inset')
  return (
    <div ref={ref} role="status" className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-warn bg-warn-soft px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs text-warn   ">
      <Badge tone="warn" size="sm">Simulated local mail</Badge>
      <span>{SIMULATION_FOOTNOTE}</span>
    </div>
  )
}
