import { Menu, Pencil } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Link, Outlet } from 'react-router'
import { useData } from '@/data/store'
import { Composer } from '@/features/compose/Composer'
import { openComposer, useComposer } from '@/features/compose/composerStore'
import { initials } from '@/lib/format'
import { OfflineBanner } from '@/ui/Async'
import { Skeleton } from '@/ui/Bits'
import { IconButton } from '@/ui/Button'
import { Modal } from '@/ui/Modal'
import { usePrefs } from './appearance'
import { GlobalSearch } from './GlobalSearch'
import { Notifications } from './Notifications'
import { Sidebar } from './Sidebar'

/** Optional user background. Blurred and scaled slightly so blurred edges never show the page colour. */
function Background() {
  const image = usePrefs((s) => s.prefs.bgImage)
  if (!image) return null
  return <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 scale-105 bg-cover bg-center" style={{ backgroundImage: `url("${image}")`, filter: 'blur(var(--bg-blur))' }} />
}

// AIDEV-NOTE: Full-height sidebar, search across the top, one work panel. Ink (--fg) marks Compose; gold accent marks state.
export function Shell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const profileName = useData((s) => s.settings.profile.name)
  const composerDraft = useComposer((s) => s.draft)

  return (
    <div className="relative isolate flex h-dvh overflow-hidden">
      <Background />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>

      <aside className="chrome hidden w-[68px] shrink-0 md:block lg:w-60">
        <Sidebar compact />
      </aside>
      <Modal open={drawerOpen} onOpenChange={setDrawerOpen} title="Navigation" side="left">
        <Sidebar onNavigate={() => setDrawerOpen(false)} />
      </Modal>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="chrome flex h-14 shrink-0 items-center gap-2 px-3 md:px-4">
          <IconButton label="Open navigation" className="size-10 md:hidden" onClick={() => setDrawerOpen(true)}>
            <Menu aria-hidden className="size-5" />
          </IconButton>
          <GlobalSearch />
          {/* Small screens hide the sidebar in a drawer, so Compose lives in the top bar where it cannot cover page actions. */}
          <button type="button" aria-label="Compose" title="Compose" onClick={() => openComposer()} className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-fg text-surface shadow-sm md:hidden">
            <Pencil aria-hidden className="size-[18px]" />
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Notifications />
            <Link to="/settings/account" aria-label="Account settings" title="Account settings" className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-xs font-semibold text-fg hover:bg-surface-2">
              {initials(profileName)}
            </Link>
          </div>
        </header>
        <OfflineBanner />
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 md:pb-3 md:pr-3">
          <div className="flex h-full flex-col overflow-hidden border-line bg-surface md:rounded-xl md:border md:shadow-sm">
            <Suspense fallback={<Skeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {composerDraft && <Composer key={composerDraft.id} initial={composerDraft} />}
    </div>
  )
}
