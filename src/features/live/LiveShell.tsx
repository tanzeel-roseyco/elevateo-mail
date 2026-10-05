import { toast } from '@/ui/toast'
import { Bot, Cable, LayoutDashboard, LogOut, Mail, Megaphone, Menu, PauseCircle, Pencil, Send, Settings, Users } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { Background } from '@/app/Background'
import { SidebarFrame, type NavItem } from '@/app/Sidebar'
import { live, useLive } from '@/data/http/instance'
import { useOnline } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Skeleton } from '@/ui/Bits'
import { IconButton } from '@/ui/Button'
import { Modal } from '@/ui/Modal'

const MAIN: NavItem[] = [
  { to: '/overview', match: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/mail', match: '/mail', label: 'Inbox', icon: Mail },
  { to: '/sends', match: '/sends', label: 'Send requests', icon: Send },
  { to: '/campaigns', match: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/contacts', match: '/contacts', label: 'Contacts', icon: Users },
  { to: '/assistant', match: '/assistant', label: 'AI Assistant', icon: Bot },
  { to: '/connections/mailboxes', match: '/connections', label: 'Connections', icon: Cable },
]
const SETTINGS: NavItem = { to: '/settings/account', match: '/settings', label: 'Settings', icon: Settings }

function LiveSidebar({ compact, onNavigate }: { compact?: boolean; onNavigate?(): void }) {
  const navigate = useNavigate()
  const simulated = useLive((s) => s.capabilities?.simulated ?? false)
  return (
    <SidebarFrame
      compact={compact}
      onNavigate={onNavigate}
      main={MAIN}
      settings={SETTINGS}
      onCompose={() => void navigate('/compose')}
      footnote={simulated ? 'Connected to the server. Its mail provider is a simulation: no real email is sent.' : 'Connected to the server.'}
    />
  )
}

/** Ends the session on the server. If the server cannot be told, the person stays signed in and is told why. */
export const signOut = (): void => void live.signOut().catch((error: unknown) => toast(`You are still signed in: ${error instanceof Error ? error.message : 'the server could not be reached.'}`, { tone: 'error' }))

/** Shown on every page while something stops requests from working or from being sent. */
function StatusBanners() {
  const online = useOnline()
  const paused = useLive((s) => s.capabilities?.dispatchPaused ?? false)
  return (
    <>
      {!online && (
        <div role="status" className="border-b border-warn/40 bg-warn/10 px-4 py-2 text-[13px]">
          <span className="font-semibold">You are offline.</span> Nothing can be loaded, submitted or approved until the connection returns. Requests already approved stay with the server.
        </div>
      )}
      {paused && (
        <div role="status" className="flex items-center gap-2 border-b border-warn/40 bg-warn/10 px-4 py-2 text-[13px]">
          <PauseCircle aria-hidden className="size-4 shrink-0 text-warn" />
          <p>
            <span className="font-semibold">Sending is paused on the server.</span> Approved requests stay queued and may expire before they are sent.
          </p>
        </div>
      )}
    </>
  )
}

// AIDEV-NOTE: Same frame as the demo Shell (sidebar, top bar, one work panel) without anything that reads mock data.
export function LiveShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const simulated = useLive((s) => s.capabilities?.simulated ?? false)
  const navigate = useNavigate()

  return (
    <div className="relative isolate flex h-dvh overflow-hidden">
      <Background />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>
      <aside className="chrome hidden w-[68px] shrink-0 md:block lg:w-60">
        <LiveSidebar compact />
      </aside>
      <Modal open={drawerOpen} onOpenChange={setDrawerOpen} title="Navigation" side="left">
        <LiveSidebar onNavigate={() => setDrawerOpen(false)} />
      </Modal>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="chrome flex h-14 shrink-0 items-center gap-2 px-3 md:px-4">
          <IconButton label="Open navigation" className="size-10 md:hidden" onClick={() => setDrawerOpen(true)}>
            <Menu aria-hidden className="size-5" />
          </IconButton>
          <Badge tone="warn" className="min-w-0 truncate">
            {simulated ? 'Server-backed · simulated provider' : 'Server-backed'}
          </Badge>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" aria-label="Compose" title="Compose" onClick={() => void navigate('/compose')} className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-fg text-surface shadow-sm md:hidden">
              <Pencil aria-hidden className="size-[18px]" />
            </button>
            <IconButton label="Sign out" className="size-9" onClick={signOut}>
              <LogOut aria-hidden className="size-[18px]" />
            </IconButton>
          </div>
        </header>
        <StatusBanners />
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 md:pb-3 md:pr-3">
          <div className="flex h-full flex-col overflow-hidden border-line bg-surface md:rounded-xl md:border md:shadow-sm">
            <Suspense fallback={<Skeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
