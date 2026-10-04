import { Bot, Cable, LayoutDashboard, Mail, Megaphone, Pencil, Settings, Users, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useData } from '@/data/store'
import { openComposer } from '@/features/compose/composerStore'
import { cx } from '@/lib/format'

export interface NavItem {
  to: string
  /** Path prefix that marks the item active (Mail stays active across folders and open threads). */
  match: string
  label: string
  icon: LucideIcon
}

const MAIN: NavItem[] = [
  { to: '/overview', match: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/mail/inbox', match: '/mail', label: 'Inbox', icon: Mail },
  { to: '/campaigns', match: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/contacts', match: '/contacts', label: 'Contacts', icon: Users },
  { to: '/assistant', match: '/assistant', label: 'AI Assistant', icon: Bot },
  { to: '/connections/mailboxes', match: '/connections', label: 'Connections', icon: Cable },
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
      className={cx('relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm', compact && 'justify-center lg:justify-start', active ? 'bg-accent-soft font-semibold text-accent-text' : 'text-fg hover:bg-surface-2')}
    >
      {/* The bar marks the current area by shape as well as tint, so it survives any user-chosen accent. */}
      {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" />}
      <item.icon aria-hidden className="size-[18px] shrink-0" />
      <span className={cx('truncate', compact ? 'sr-only lg:not-sr-only lg:flex-1' : 'flex-1')}>{item.label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={cx('rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-semibold tabular-nums shadow-[inset_0_0_0_1px_var(--line)]', compact && 'sr-only lg:not-sr-only')}>
          {badge}
          <span className="sr-only"> unread</span>
        </span>
      )}
    </Link>
  )
}

interface FrameProps {
  compact?: boolean
  onNavigate?(): void
  main: NavItem[]
  settings: NavItem
  /** Count shown beside the item whose `match` equals the key. */
  badges?: Record<string, number>
  onCompose(): void
  /** One honest line about what this build does and does not do. */
  footnote: string
}

/** Layout shared by the demo and API-backed sidebars. `compact` is an icon rail that expands at the lg breakpoint. */
export function SidebarFrame({ compact = false, onNavigate, main, settings, badges, onCompose, footnote }: FrameProps) {
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className={cx('mb-3 flex h-9 items-center gap-2.5 px-2', compact && 'justify-center lg:justify-start')}>
        {/* Transparent gold mark, shown as supplied on either theme: no backing shape, fixed square so proportions hold. */}
        <img src="/logo.png" alt="" width={32} height={32} className="size-8 shrink-0 object-contain" />
        <span className={cx('truncate text-[15px] font-semibold tracking-tight', compact && 'sr-only lg:not-sr-only')}>Elevateo Mail</span>
      </div>
      {/* Ink, not accent: Compose is the one constant action, so it keeps its weight whatever accent the user picks. */}
      <button
        type="button"
        onClick={() => {
          onCompose()
          onNavigate?.()
        }}
        className={cx('mb-4 flex h-10 items-center gap-2.5 rounded-lg bg-fg px-3.5 text-sm font-semibold text-surface shadow-sm transition hover:opacity-90', compact && 'justify-center lg:justify-start')}
      >
        <Pencil aria-hidden className="size-4 shrink-0" />
        <span className={cx(compact && 'sr-only lg:not-sr-only')}>Compose</span>
      </button>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5">
        {main.map((item) => (
          <Item key={item.to} item={item} compact={compact} badge={badges?.[item.match]} onNavigate={onNavigate} />
        ))}
        <div className="mt-auto border-t border-line pt-2">
          <Item item={settings} compact={compact} onNavigate={onNavigate} />
        </div>
      </nav>
      {/* Honest framing wherever the user is. */}
      <p className={cx('px-3 pt-1 text-[11px] leading-snug text-fg', compact && 'hidden lg:block')}>{footnote}</p>
    </div>
  )
}

/** Demo sidebar: mock data only, nothing leaves the browser. */
export function Sidebar({ compact = false, onNavigate }: { compact?: boolean; onNavigate?(): void }) {
  const unread = useData((s) => s.threads.reduce((n, t) => n + (t.folder === 'inbox' && t.unread ? 1 : 0), 0))
  return <SidebarFrame compact={compact} onNavigate={onNavigate} main={MAIN} settings={SETTINGS} badges={{ '/mail': unread }} onCompose={() => openComposer()} footnote="Prototype · mock data. No email is sent." />
}
