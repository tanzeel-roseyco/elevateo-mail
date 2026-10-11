// Responsive shell: skip link, sidebar as a drawer below the md breakpoint, labelled main region.
// Layout ideas adapted from first-party Ledger frontend 4322cfbb, src/features/live/LiveShell.tsx
// (blob 2633baf7…); session/capability wiring replaced with the FE-01 session controller.
import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import type { Mailbox } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'
import { IconButton } from '@/ui/Button'
import { MenuIcon } from '@/ui/icons'
import { Sidebar } from './Sidebar'
import { useGateway, useSession } from './session'

const FOOTNOTE = 'Read-only checkpoint. Simulated local data; no mail is sent or received.'

type MailboxState = { status: 'loading' } | { status: 'ready'; mailboxes: Mailbox[] } | { status: 'error'; message: string }

export function Shell() {
  const gateway = useGateway()
  const { state: sessionState, scope, context, refresh, handleError } = useSession()
  const [mailboxState, setMailboxState] = useState<MailboxState>({ status: 'loading' })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    if (!context) return
    const generation = scope.current()
    const controller = new AbortController()
    setMailboxState({ status: 'loading' })
    const loadAll = async () => {
      // getMailboxes is the sole capability list; follow continuation cursors to completion.
      const mailboxes: Mailbox[] = []
      let cursor: string | undefined
      do {
        const page = await gateway.listMailboxes(context, cursor === undefined ? {} : { cursor }, controller.signal)
        mailboxes.push(...page.items)
        cursor = page.next_cursor ?? undefined
      } while (cursor !== undefined)
      return mailboxes
    }
    loadAll().then(
      (mailboxes) => {
        if (!scope.isCurrent(generation) || controller.signal.aborted) return
        setMailboxState({ status: 'ready', mailboxes })
      },
      (error: unknown) => {
        if (controller.signal.aborted || handleError(error, generation)) return
        setMailboxState({ status: 'error', message: error instanceof GatewayError ? error.message : 'Mailboxes could not be loaded.' })
      },
    )
    return () => controller.abort()
  }, [gateway, context, scope, handleError])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  if (sessionState.status === 'loading') {
    return (
      <div role="status" aria-label="Loading session" className="mx-auto max-w-lg p-8">
        <Skeleton rows={4} />
      </div>
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

  const { session } = sessionState
  const sidebar =
    mailboxState.status === 'loading' ? (
      <div role="status" aria-label="Loading mailboxes"><Skeleton rows={4} /></div>
    ) : mailboxState.status === 'error' ? (
      <div role="alert" className="p-3">
        <p className="text-[13px] text-muted">{mailboxState.message}</p>
        <Button size="sm" className="mt-2" onClick={refresh}>Try again</Button>
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
      {drawerOpen && (
        <div className="fixed inset-0 z-10 md:hidden">
          <button type="button" aria-label="Close mailbox menu" className="absolute inset-0 bg-black/40" onClick={closeDrawer} />
          <div role="dialog" aria-modal="true" aria-label="Mailboxes" className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-lg">
            {sidebar}
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <span className="md:hidden">
            <IconButton label="Open mailbox menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
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
