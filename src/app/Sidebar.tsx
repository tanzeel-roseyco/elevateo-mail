import { LayoutDashboard, Mail, Megaphone, Pencil, Settings, Users, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useData } from '@/data/store'
import { openComposer } from '@/features/compose/composerStore'
import { cx } from '@/lib/format'

interface NavItem {
  to: string
  /** Path prefix that marks the item active (Mail stays active across folders and open threads). */
  match: string
  label: string
  icon: LucideIcon
}

const MAIN: NavItem[] = [
  { to: '/overview', match: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/mail/inbox', match: '/mail', label: 'Mail', icon: Mail },
  { to: '/campaigns', match: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/contacts', match: '/contacts', label: 'Contacts', icon: Users },
]
const SETTINGS: NavItem = { to: '/settings/appearance', match: '/settings', label: 'Settings', icon: Settings }

// AIDEV-NOTE: Text here is always --fg, never --muted: the sidebar sits over the user's background (see .chrome).
function Item({ item, compact, badge, onNavigate }: { item: NavItem; compact: boolean; badge?: number; onNavigate?(): void }) {
  const { pathname } = useLocation()
  // Whole path segment only: "/campaigns-old" must not light up Campaigns.
  const active = pathname === item.match || pathname.startsWith(`${item.match}/`)
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      title={compact ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cx('flex h-10 items-center gap-3 rounded-full px-3 text-sm', compact && 'justify-center lg:justify-start', active ? 'bg-accent-soft font-semibold text-accent-text' : 'text-fg hover:bg-surface-2')}
    >
      <item.icon aria-hidden className="size-[18px] shrink-0" />
      <span className={cx('truncate', compact ? 'sr-only lg:not-sr-only lg:flex-1' : 'flex-1')}>{item.label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={cx('text-xs font-semibold', compact && 'sr-only lg:not-sr-only')}>
          {badge}
          <span className="sr-only"> unread</span>
        </span>
      )}
    </Link>
  )
}

/** `compact` renders an icon rail on tablets that expands to full labels at the lg breakpoint. */
export function Sidebar({ compact = false, onNavigate }: { compact?: boolean; onNavigate?(): void }) {
  const unread = useData((s) => s.threads.reduce((n, t) => n + (t.folder === 'inbox' && t.unread ? 1 : 0), 0))
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className={cx('mb-2 flex h-9 items-center gap-2 px-2', compact && 'justify-center lg:justify-start')}>
        <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <Mail className="size-4" />
        </span>
        <span className={cx('truncate text-[15px] font-semibold tracking-tight', compact && 'sr-only lg:not-sr-only')}>Elevateo Mail</span>
      </div>
      <button
        type="button"
        onClick={() => {
          openComposer()
          onNavigate?.()
        }}
        className={cx('mb-3 flex h-12 items-center gap-3 rounded-2xl bg-accent px-4 text-sm font-semibold text-accent-fg shadow-md transition hover:brightness-110', compact && 'justify-center lg:justify-start')}
      >
        <Pencil aria-hidden className="size-[18px] shrink-0" />
        <span className={cx(compact && 'sr-only lg:not-sr-only')}>Compose</span>
      </button>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5">
        {MAIN.map((item) => (
          <Item key={item.to} item={item} compact={compact} badge={item.match === '/mail' ? unread : undefined} onNavigate={onNavigate} />
        ))}
        <div className="mt-auto border-t border-line pt-2">
          <Item item={SETTINGS} compact={compact} onNavigate={onNavigate} />
        </div>
      </nav>
    </div>
  )
}
