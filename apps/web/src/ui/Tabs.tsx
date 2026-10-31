// Flux tabs recipe (DESIGN-SPEC §5.13): h-10 row, hairline underneath, 2px accent underline on the
// selected tab. `LinkTabs` is navigation between routes (settings sections); `ButtonTabs` switches
// in-page views (inbox All/Unread) and exposes the WAI-ARIA tablist pattern.
import { Link, useLocation, useMatch } from 'react-router'
import { cx } from '@/lib/format'

const ROW = 'flex h-10 gap-4 overflow-x-auto border-b border-line '
const TAB = '-mb-px inline-flex shrink-0 items-center border-b-2 px-2 text-sm font-medium'
// AIDEV-NOTE: Colour classes never go in TAB. Tailwind orders same-property utilities itself, so a
// border-transparent/text-muted default there silently out-ranked SELECTED (no gold underline).
// Inactive text uses the same accessible muted ink as descriptions.
const INACTIVE = 'border-transparent text-muted hover:text-fg  '
const SELECTED = 'border-line text-fg'

export interface LinkTab {
  to: string
  label: string
  /** Match the route exactly (default) or as a prefix. */
  end?: boolean
  /** Extra exact pathnames that also select this tab (the settings hub at bare /settings). */
  activeAt?: readonly string[]
}

function LinkTabItem({ tab }: { tab: LinkTab }) {
  const { pathname } = useLocation()
  const matched = useMatch({ path: tab.to, end: tab.end ?? true }) !== null
  const active = matched || (tab.activeAt?.includes(pathname) ?? false)
  return (
    <Link to={tab.to} aria-current={active ? 'page' : undefined} className={cx(TAB, active ? SELECTED : INACTIVE)}>
      {tab.label}
    </Link>
  )
}

export function LinkTabs({ tabs, label, className }: { tabs: readonly LinkTab[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx(ROW, className)}>
      {tabs.map((tab) => <LinkTabItem key={tab.to} tab={tab} />)}
    </nav>
  )
}

export interface ButtonTab<K extends string> {
  key: K
  label: string
  count?: number
}

interface ButtonTabsProps<K extends string> {
  tabs: readonly ButtonTab<K>[]
  value: K
  onChange(key: K): void
  label: string
  className?: string
}

export function ButtonTabs<K extends string>({ tabs, value, onChange, label, className }: ButtonTabsProps<K>) {
  return (
    <div role="tablist" aria-label={label} className={cx(ROW, className)}>
      {tabs.map((tab) => {
        const selected = tab.key === value
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={cx(TAB, selected ? SELECTED : INACTIVE)}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => {
              // Left/Right move selection within the tablist, per the ARIA tabs pattern.
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
              event.preventDefault()
              const index = tabs.findIndex((t) => t.key === value)
              const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
              const next = tabs[nextIndex]
              if (!next) return
              onChange(next.key)
              // Automatic activation: the newly selected tab also receives focus.
              event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus()
            }}
          >
            {tab.label}
            {typeof tab.count === 'number' && <span className="ms-1.5 text-xs text-muted">{tab.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
