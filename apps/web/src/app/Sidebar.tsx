// Adapted from first-party Ledger frontend 4322cfbb, src/app/Sidebar.tsx SidebarFrame export
// (blob 069b198e…). Changes: navigation is the current mailbox list instead of fixed product areas;
// removed data/store + composerStore imports, mock unread counts and the Compose action.
// 2026-10-18 IA refresh (docs/design/ux-audit-20261018.md): the rail is grouped by job — Today,
// Mail (search, mailboxes with their drafts/members), then each registered FEATURE_SECTIONS group
// (Outreach, Contacts, Settings). Every item carries an icon so groups scan by shape as well as text.
// There is deliberately no global mode switcher: every list is always visible and the URL alone
// says where you are.
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Link, useLocation } from 'react-router'
import type { Mailbox } from '@/data/contract'
import { cx } from '@/lib/format'
import { BrandMark } from '@/ui/BrandMark'
import {
  AtIcon,
  BuildingIcon,
  ChartIcon,
  HomeIcon,
  InboxIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  UsersIcon,
} from '@/ui/icons'
import { FEATURE_SECTIONS, type FeatureNavEntry, type FeatureSection } from './featureRegistry'

const ITEM = 'relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors'
const ACTIVE = 'bg-accent-soft font-semibold text-accent-text'
const IDLE = 'text-fg hover:bg-surface-2'

// AIDEV-NOTE: Icons are looked up by registered path so feature owners keep registering plain
// {path,label}; an unknown path simply renders without an icon rather than failing.
const FEATURE_ICONS: Readonly<Record<string, ComponentType<SVGProps<SVGSVGElement>>>> = {
  '/outreach/campaigns': SendIcon,
  '/outreach/leads': UsersIcon,
  '/outreach/accounts': AtIcon,
  '/outreach/analytics': ChartIcon,
  '/people': UsersIcon,
  '/settings/personal': SettingsIcon,
  '/settings/organization': BuildingIcon,
}

/** Whole path segment only, so one path being a prefix of another cannot mark both active. */
function isWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

/** The bar marks the current area by shape as well as tint, so it survives any accent. */
function ActiveBar() {
  return <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" />
}

function MailboxItem({ mailbox, onNavigate }: { mailbox: Mailbox; onNavigate?: (() => void) | undefined }) {
  const { pathname } = useLocation()
  const base = `/mailboxes/${mailbox.id}`
  const active = isWithin(pathname, base)
  // Sub-areas of the active mailbox (BE-02 C/D). Capabilities are display hints; the server decides.
  const subLinks: Array<{ to: string; label: string }> = []
  if (mailbox.capabilities.compose) subLinks.push({ to: `${base}/drafts`, label: 'Drafts' })
  if (mailbox.capabilities.manage_members) subLinks.push({ to: `${base}/members`, label: 'Members' })
  return (
    <li>
      <Link to={base} onClick={onNavigate} aria-current={pathname === base ? 'page' : undefined} className={cx(ITEM, active ? ACTIVE : IDLE)}>
        {active && <ActiveBar />}
        <InboxIcon aria-hidden className="size-[18px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">{mailbox.display_name}</span>
      </Link>
      {active && subLinks.length > 0 && (
        <ul className="mb-1 ml-[22px] mt-0.5 flex flex-col gap-0.5 border-l border-line pl-3">
          {subLinks.map((link) => {
            const current = isWithin(pathname, link.to)
            return (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={onNavigate}
                  aria-current={pathname === link.to ? 'page' : undefined}
                  className={cx('flex h-8 items-center rounded-md px-2 text-[13px]', current ? ACTIVE : IDLE)}
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

/** A plain top-level link (Today, Search, registered features); active for its path and anything nested under it. */
function NavLink({ to, label, exact = false, Icon, onNavigate }: {
  to: string
  label: string
  exact?: boolean
  Icon?: ComponentType<SVGProps<SVGSVGElement>> | undefined
  onNavigate?: (() => void) | undefined
}) {
  const { pathname } = useLocation()
  const active = exact ? pathname === to : isWithin(pathname, to)
  return (
    <li>
      <Link to={to} onClick={onNavigate} aria-current={pathname === to ? 'page' : undefined} className={cx(ITEM, active ? ACTIVE : IDLE)}>
        {active && <ActiveBar />}
        {Icon && <Icon aria-hidden className="size-[18px] shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </Link>
    </li>
  )
}

function Group({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <nav aria-labelledby={id} className="flex flex-col gap-0.5">
      <p id={id} className="eyebrow px-3 pb-1.5 pt-3">{label}</p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </nav>
  )
}

interface SidebarProps {
  mailboxes: readonly Mailbox[]
  /** Registered feature links per section; an empty section is not rendered at all. */
  sections?: Partial<Readonly<Record<FeatureSection, readonly FeatureNavEntry[]>>>
  onNavigate?: () => void
  /** One honest line about the transport mode, or null when the server reports no simulation. */
  footnote: string | null
}

export function Sidebar({ mailboxes, sections = {}, onNavigate, footnote }: SidebarProps) {
  const mailExtras = sections.mail ?? []
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex h-10 items-center gap-2.5 px-1">
        {/* Visible product text names the product, so the authentic mark is decorative here. */}
        <BrandMark size={28} decorative />
        <span className="truncate text-[15px] font-semibold tracking-tight">Elevateo Mail</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <nav aria-label="Home">
          <ul>
            <NavLink to="/" label="Today" exact Icon={HomeIcon} onNavigate={onNavigate} />
          </ul>
        </nav>
        {/* Mail: search and the actor's visible mailboxes. Independent of the sections below. */}
        <Group id="sidebar-mail" label="Mail">
          <NavLink to="/search" label="Search" Icon={SearchIcon} onNavigate={onNavigate} />
          {mailboxes.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No mailboxes are visible to you.</li>}
          {mailboxes.map((mailbox) => (
            <MailboxItem key={mailbox.id} mailbox={mailbox} onNavigate={onNavigate} />
          ))}
          {mailExtras.map((entry) => (
            <NavLink key={entry.path} to={entry.path} label={entry.label} Icon={FEATURE_ICONS[entry.path]} onNavigate={onNavigate} />
          ))}
        </Group>
        {/* Each registered section is its own landmark; none of them depends on the others. */}
        {FEATURE_SECTIONS.map(({ key, label }) => {
          const entries = sections[key] ?? []
          if (entries.length === 0) return null
          return (
            <Group key={key} id={`sidebar-${key}`} label={label}>
              {entries.map((entry) => (
                <NavLink key={entry.path} to={entry.path} label={entry.label} Icon={FEATURE_ICONS[entry.path]} onNavigate={onNavigate} />
              ))}
            </Group>
          )
        })}
      </div>
      {/* Honest framing wherever the user is; absent when the server reports no simulation. */}
      {footnote !== null && (
        <p className="mt-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-snug text-fg">{footnote}</p>
      )}
    </div>
  )
}
