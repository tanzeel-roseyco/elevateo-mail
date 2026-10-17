// Adapted from first-party Ledger frontend 4322cfbb, src/app/Sidebar.tsx SidebarFrame export
// (blob 069b198e…). Changes: navigation is the current mailbox list with an all/unread URL filter
// instead of fixed product areas; removed data/store + composerStore imports, mock unread counts,
// the Compose action (no enabled composer controls in this checkpoint) and the logo.png asset
// (image rights unverified; text brand instead). Active-item presentation and footnote retained.
import { Link, useLocation } from 'react-router'
import type { Mailbox } from '@/data/contract'
import { cx } from '@/lib/format'
import { MailboxIcon } from '@/ui/icons'

function Item({ mailbox, onNavigate }: { mailbox: Mailbox; onNavigate?: (() => void) | undefined }) {
  const { pathname } = useLocation()
  const base = `/mailboxes/${mailbox.id}`
  // Whole path segment only, so one mailbox id being a prefix of another cannot mark both active.
  const active = pathname === base || pathname.startsWith(`${base}/`)
  // Sub-areas of the active mailbox (BE-02 C/D). Capabilities are display hints; the server decides.
  const subLinks: Array<{ to: string; label: string }> = []
  if (mailbox.capabilities.compose) subLinks.push({ to: `${base}/drafts`, label: 'Drafts' })
  if (mailbox.capabilities.manage_members) subLinks.push({ to: `${base}/members`, label: 'Members' })
  return (
    <>
      <Link
        to={base}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm',
          active ? 'bg-accent-soft font-semibold text-accent-text' : 'text-fg hover:bg-surface-2',
        )}
      >
        {/* The bar marks the current area by shape as well as tint, so it survives any accent. */}
        {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" />}
        <MailboxIcon aria-hidden className="size-[18px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">{mailbox.display_name}</span>
      </Link>
      {active && subLinks.length > 0 && (
        <ul className="mb-1 ml-8 flex flex-col gap-0.5">
          {subLinks.map((link) => {
            const current = pathname === link.to || pathname.startsWith(`${link.to}/`)
            return (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={onNavigate}
                  aria-current={current ? 'page' : undefined}
                  className={cx('flex h-8 items-center rounded-lg px-2 text-[13px]', current ? 'bg-accent-soft font-semibold text-accent-text' : 'text-fg hover:bg-surface-2')}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/** Search entry for every viewport; the header form is hidden below the sm breakpoint. */
function SearchLink({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { pathname } = useLocation()
  const active = pathname === '/search'
  return (
    <Link
      to="/search"
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cx('flex h-9 items-center gap-3 rounded-lg px-3 text-sm', active ? 'bg-accent-soft font-semibold text-accent-text' : 'text-fg hover:bg-surface-2')}
    >
      <span aria-hidden className="inline-block size-[18px] shrink-0 text-center">⌕</span>
      <span>Search</span>
    </Link>
  )
}

interface SidebarProps {
  mailboxes: readonly Mailbox[]
  onNavigate?: () => void
  /** One honest line about what this build does and does not do. */
  footnote: string
}

export function Sidebar({ mailboxes, onNavigate, footnote }: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="mb-3 flex h-9 items-center gap-2.5 px-2">
        <MailboxIcon aria-hidden className="size-6 shrink-0 text-accent-text" />
        <span className="truncate text-[15px] font-semibold tracking-tight">Elevateo Mail</span>
      </div>
      <nav aria-label="Mailboxes" className="flex flex-1 flex-col gap-0.5">
        <SearchLink onNavigate={onNavigate} />
        <p className="eyebrow px-3 pb-1 pt-2">Mailboxes</p>
        {mailboxes.length === 0 && <p className="px-3 py-2 text-[13px] text-muted">No mailboxes are visible to you.</p>}
        {mailboxes.map((mailbox) => (
          <Item key={mailbox.id} mailbox={mailbox} onNavigate={onNavigate} />
        ))}
      </nav>
      {/* Honest framing wherever the user is. */}
      <p className="px-3 pt-1 text-[11px] leading-snug text-fg">{footnote}</p>
    </div>
  )
}
