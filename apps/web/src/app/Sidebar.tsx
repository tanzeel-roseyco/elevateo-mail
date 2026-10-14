// Adapted from first-party Ledger frontend 4322cfbb, src/app/Sidebar.tsx SidebarFrame export
// (blob 069b198e…). Changes: navigation is the current mailbox list with an all/unread URL filter
// instead of fixed product areas; removed data/store + composerStore imports, mock unread counts
// and the Compose action (no enabled composer controls in this checkpoint). Active-item
// presentation and footnote retained. FE-805: the brand header now renders the authentic Elevateo
// mark (BrandMark) and the rail is split into independent sections: Personal (mailboxes, search)
// followed by each registered FEATURE_SECTIONS group (Outreach, Organization). There is
// deliberately no global mode switcher: every list is always visible and the URL alone says where you are.
import { Link, useLocation } from 'react-router'
import type { Mailbox } from '@/data/contract'
import { cx } from '@/lib/format'
import { BrandMark } from '@/ui/BrandMark'
import { MailboxIcon } from '@/ui/icons'
import { FEATURE_SECTIONS, type FeatureNavEntry, type FeatureSection } from './featureRegistry'

const ITEM = 'flex h-9 items-center gap-3 rounded-lg px-3 text-sm'
const ACTIVE = 'bg-accent-soft font-semibold text-accent-text'
const IDLE = 'text-fg hover:bg-surface-2'

/** Whole path segment only, so one path being a prefix of another cannot mark both active. */
function isWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

function Item({ mailbox, onNavigate }: { mailbox: Mailbox; onNavigate?: (() => void) | undefined }) {
  const { pathname } = useLocation()
  const base = `/mailboxes/${mailbox.id}`
  const active = isWithin(pathname, base)
  // Sub-areas of the active mailbox (BE-02 C/D). Capabilities are display hints; the server decides.
  const subLinks: Array<{ to: string; label: string }> = []
  if (mailbox.capabilities.compose) subLinks.push({ to: `${base}/drafts`, label: 'Drafts' })
  if (mailbox.capabilities.manage_members) subLinks.push({ to: `${base}/members`, label: 'Members' })
  return (
    <li>
      <Link
        to={base}
        onClick={onNavigate}
        aria-current={pathname === base ? 'page' : undefined}
        className={cx('relative', ITEM, active ? ACTIVE : IDLE)}
      >
        {/* The bar marks the current area by shape as well as tint, so it survives any accent. */}
        {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" />}
        <MailboxIcon aria-hidden className="size-[18px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">{mailbox.display_name}</span>
      </Link>
      {active && subLinks.length > 0 && (
        <ul className="mb-1 ml-8 flex flex-col gap-0.5">
          {subLinks.map((link) => {
            const current = pathname === link.to
            return (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={onNavigate}
                  aria-current={current ? 'page' : undefined}
                  className={cx('flex h-8 items-center rounded-lg px-2 text-[13px]', current ? ACTIVE : IDLE)}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

/** Search entry for every viewport; the header form is hidden below the sm breakpoint. */
function SearchLink({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { pathname } = useLocation()
  const active = pathname === '/search'
  return (
    <li>
      <Link to="/search" onClick={onNavigate} aria-current={active ? 'page' : undefined} className={cx(ITEM, active ? ACTIVE : IDLE)}>
        <span aria-hidden className="inline-block size-[18px] shrink-0 text-center">⌕</span>
        <span>Search</span>
      </Link>
    </li>
  )
}

/** A registered feature link; active for the path and anything nested under it. */
function FeatureLink({ entry, onNavigate }: { entry: FeatureNavEntry; onNavigate?: (() => void) | undefined }) {
  const { pathname } = useLocation()
  const active = isWithin(pathname, entry.path)
  return (
    <li>
      <Link to={entry.path} onClick={onNavigate} aria-current={pathname === entry.path ? 'page' : undefined} className={cx('relative', ITEM, active ? ACTIVE : IDLE)}>
        {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" />}
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      </Link>
    </li>
  )
}

interface SidebarProps {
  mailboxes: readonly Mailbox[]
  /** Registered feature links per section; an empty section is not rendered at all. */
  sections?: Partial<Readonly<Record<FeatureSection, readonly FeatureNavEntry[]>>>
  onNavigate?: () => void
  /** One honest line about what this build does and does not do. */
  footnote: string
}

export function Sidebar({ mailboxes, sections = {}, onNavigate, footnote }: SidebarProps) {
  const personal = sections.personal ?? []
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="mb-3 flex h-10 items-center gap-2.5 px-1">
        {/* Visible product text names the product, so the authentic mark is decorative here. */}
        <BrandMark size={28} decorative />
        <span className="truncate text-[15px] font-semibold tracking-tight">Elevateo Mail</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {/* Personal: the actor's visible mailboxes and search. Independent of Outreach below. */}
        <nav aria-labelledby="sidebar-personal" className="flex flex-col gap-0.5">
          <p id="sidebar-personal" className="eyebrow px-3 pb-1 pt-2">Personal</p>
          <ul className="flex flex-col gap-0.5">
            <SearchLink onNavigate={onNavigate} />
            {mailboxes.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No mailboxes are visible to you.</li>}
            {mailboxes.map((mailbox) => (
              <Item key={mailbox.id} mailbox={mailbox} onNavigate={onNavigate} />
            ))}
            {personal.map((entry) => (
              <FeatureLink key={entry.path} entry={entry} onNavigate={onNavigate} />
            ))}
          </ul>
        </nav>
        {/* Each registered section is its own landmark; none of them depends on the others. */}
        {FEATURE_SECTIONS.map(({ key, label }) => {
          const entries = sections[key] ?? []
          if (entries.length === 0) return null
          return (
            <nav key={key} aria-labelledby={`sidebar-${key}`} className="flex flex-col gap-0.5">
              <p id={`sidebar-${key}`} className="eyebrow px-3 pb-1 pt-2">{label}</p>
              <ul className="flex flex-col gap-0.5">
                {entries.map((entry) => (
                  <FeatureLink key={entry.path} entry={entry} onNavigate={onNavigate} />
                ))}
              </ul>
            </nav>
          )
        })}
      </div>
      {/* Honest framing wherever the user is. */}
      <p className="px-3 pt-1 text-[11px] leading-snug text-fg">{footnote}</p>
    </div>
  )
}
