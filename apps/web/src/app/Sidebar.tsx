// EmailGuard sidebar (DESIGN-SPEC §3): brand row with collapse toggle, workspace select, Flux
// navlist, spacer and the profile dropdown. Items are ordered by what the team opens most:
// Inbox and Dashboard first, then the Mail group (every visible mailbox and Search), the
// registered Outreach and Contacts groups, and Settings / Help at the bottom.
// AIDEV-NOTE: Group landmarks keep their names ("Mail", "Outreach", "Contacts") because e2e/support.ts
// and the shell tests navigate by `navigation` role + name. The URL alone decides which link is
// current; `aria-current="page"` is set only on the exact match.
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Link, useLocation } from 'react-router'
import type { Mailbox, Session } from '@/data/contract'
import { cx } from '@/lib/format'
import { Skeleton } from '@/ui/Async'
import { BrandLockup } from '@/ui/BrandLockup'
import { BrandMark } from '@/ui/BrandMark'
import { Button, IconButton } from '@/ui/Button'
import {
  ArrowPathIcon,
  AtSymbolIcon,
  ChartBarIcon,
  ChevronLeftIcon,
  Cog6ToothIcon,
  EnvelopeIcon,
  HomeIcon,
  InboxIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  QuestionMarkCircleIcon,
  UsersIcon,
  XMarkIcon,
} from '@/ui/icons'
import { FEATURE_SECTIONS, type FeatureNavEntry, type FeatureSection } from './featureRegistry'
import { UserMenu } from './UserMenu'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

// AIDEV-NOTE: Icons are looked up by registered path so feature owners keep registering plain
// {path,label}; an unknown path falls back to a generic glyph rather than failing.
const FEATURE_ICONS: Readonly<Record<string, Icon>> = {
  '/outreach/campaigns': PaperAirplaneIcon,
  '/outreach/leads': UsersIcon,
  '/outreach/accounts': AtSymbolIcon,
  '/outreach/analytics': ChartBarIcon,
  '/people': UsersIcon,
}

const ITEM =
  'relative my-px flex h-8 w-full items-center gap-3 rounded-lg border border-transparent px-3 text-start text-zinc-500 hover:bg-zinc-800/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
const CURRENT =
  'border-zinc-200 bg-white text-(--color-accent-content) hover:text-(--color-accent-content) dark:border-white/10 dark:bg-white/10 dark:text-(--color-accent-content)'

/** Whole path segment only, so one path being a prefix of another cannot mark both active. */
function isWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

export type MailboxNavState = { status: 'loading' } | { status: 'error'; message: string; retry(): void } | { status: 'ready'; mailboxes: readonly Mailbox[] }

interface NavItemProps {
  to: string
  label: string
  Icon: Icon
  exact?: boolean
  collapsed: boolean
  onNavigate?: (() => void) | undefined
}

function NavItem({ to, label, Icon, exact = false, collapsed, onNavigate }: NavItemProps) {
  const { pathname } = useLocation()
  const current = exact ? pathname === to : isWithin(pathname, to)
  return (
    <li>
      <Link
        to={to}
        onClick={onNavigate}
        aria-current={pathname === to ? 'page' : undefined}
        data-current={current || undefined}
        title={collapsed ? label : undefined}
        className={cx(ITEM, current && CURRENT, collapsed && 'justify-center px-0')}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className={cx('flex-1 whitespace-nowrap text-sm font-medium leading-none', collapsed && 'sr-only')}>{label}</span>
      </Link>
    </li>
  )
}

function Group({ id, label, collapsed, children }: { id: string; label: string; collapsed: boolean; children: ReactNode }) {
  return (
    <nav aria-labelledby={id} className="flex flex-col">
      <p id={id} className={cx('px-3 pb-1 pt-3 text-xs font-medium text-zinc-400', collapsed && 'sr-only')}>{label}</p>
      <ul className="flex flex-col">{children}</ul>
    </nav>
  )
}

interface SidebarProps {
  session: Session
  mailboxes: MailboxNavState
  /** Registered feature links per section; an empty section is not rendered at all. */
  sections?: Partial<Readonly<Record<FeatureSection, readonly FeatureNavEntry[]>>>
  onNavigate?: () => void
  /** Desktop icon-only mode; never used inside the mobile drawer. */
  collapsed?: boolean
  onToggle?: () => void
  /** Rendered inside the mobile drawer: the toggle closes the drawer and the footer menu is omitted. */
  inDrawer?: boolean
}

export function Sidebar({ session, mailboxes, sections = {}, onNavigate, collapsed = false, onToggle, inDrawer = false }: SidebarProps) {
  const mailExtras = sections.mail ?? []
  return (
    <div className={cx('flex h-full min-h-0 flex-col gap-4', collapsed ? 'p-2' : 'p-4')}>
      <div className={cx('flex min-h-10 items-center gap-2', collapsed ? 'flex-col' : 'justify-between')}>
        {collapsed ? (
          <Link to="/" aria-label="Elevateo home" className="flex h-10 items-center justify-center rounded-md">
            <BrandMark size={24} decorative className="rounded-md p-0.5" />
          </Link>
        ) : (
          <BrandLockup className="h-10 px-2" />
        )}
        {inDrawer ? (
          <IconButton label="Close navigation" variant="subtle" size="md" onClick={onNavigate}>
            <XMarkIcon className="size-5" />
          </IconButton>
        ) : (
          onToggle && (
            <IconButton label="Toggle sidebar" variant="subtle" size="md" aria-expanded={!collapsed} onClick={onToggle}>
              <ChevronLeftIcon className={cx('size-5 transition-transform', collapsed && 'rotate-180')} />
            </IconButton>
          )
        )}
      </div>

      {!collapsed && <WorkspaceSwitcher session={session} />}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <nav aria-label="Primary">
          <ul className="flex flex-col">
            <NavItem to="/inbox" label="Inbox" Icon={InboxIcon} collapsed={collapsed} onNavigate={onNavigate} />
            <NavItem to="/" label="Dashboard" Icon={HomeIcon} exact collapsed={collapsed} onNavigate={onNavigate} />
          </ul>
        </nav>

        {/* Mail: every mailbox the actor can see, then search. Independent of the sections below. */}
        <Group id="sidebar-mail" label="Mail" collapsed={collapsed}>
          {mailboxes.status === 'loading' && (
            <li role="status" aria-label="Loading mailboxes" className="px-1 py-1"><Skeleton rows={2} /></li>
          )}
          {mailboxes.status === 'error' && (
            <li role="alert" className={collapsed ? 'flex justify-center py-1' : 'px-3 py-2'}>
              {collapsed ? (
                // The 56px rail has no room for prose: the icon button carries the message as its name.
                <IconButton label={`${mailboxes.message} Try again`} variant="subtle" onClick={mailboxes.retry}>
                  <ArrowPathIcon className="size-4" />
                </IconButton>
              ) : (
                <>
                  <p className="text-sm text-zinc-500">{mailboxes.message}</p>
                  <Button size="sm" className="mt-2" onClick={mailboxes.retry}>Try again</Button>
                </>
              )}
            </li>
          )}
          {mailboxes.status === 'ready' && mailboxes.mailboxes.length === 0 && (
            <li className={cx('px-3 py-2 text-sm text-zinc-500', collapsed && 'sr-only')}>No mailboxes are visible to you.</li>
          )}
          {mailboxes.status === 'ready' &&
            mailboxes.mailboxes.map((mailbox) => (
              <NavItem key={mailbox.id} to={`/mailboxes/${mailbox.id}`} label={mailbox.display_name} Icon={EnvelopeIcon} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          <NavItem to="/search" label="Search" Icon={MagnifyingGlassIcon} collapsed={collapsed} onNavigate={onNavigate} />
          {mailExtras.map((entry) => (
            <NavItem key={entry.path} to={entry.path} label={entry.label} Icon={FEATURE_ICONS[entry.path] ?? EnvelopeIcon} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </Group>

        {/* Registered sections are independent landmarks; the settings section is replaced by the
            Settings area link below, so only Outreach and Contacts render here. */}
        {FEATURE_SECTIONS.filter(({ key }) => key !== 'settings').map(({ key, label }) => {
          const entries = sections[key] ?? []
          if (entries.length === 0) return null
          return (
            <Group key={key} id={`sidebar-${key}`} label={label} collapsed={collapsed}>
              {entries.map((entry) => (
                <NavItem key={entry.path} to={entry.path} label={entry.label} Icon={FEATURE_ICONS[entry.path] ?? UsersIcon} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </Group>
          )
        })}

        <div className="flex-1" />

        <nav aria-label="Administration" className="mt-3">
          <ul className="flex flex-col">
            <NavItem to="/settings" label="Settings" Icon={Cog6ToothIcon} collapsed={collapsed} onNavigate={onNavigate} />
            <NavItem to="/help" label="Help" Icon={QuestionMarkCircleIcon} collapsed={collapsed} onNavigate={onNavigate} />
          </ul>
        </nav>
      </div>

      {!inDrawer && <UserMenu session={session} compact={collapsed} />}
    </div>
  )
}
