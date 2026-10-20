// Flux tabs recipe (DESIGN-SPEC §5.13): h-10 row, hairline underneath, 2px accent underline on the
// selected tab. `LinkTabs` is navigation between routes (settings sections); `ButtonTabs` switches
// in-page views (inbox All/Unread) and exposes the WAI-ARIA tablist pattern.
import { NavLink } from 'react-router'
import { cx } from '@/lib/format'

const ROW = 'flex h-10 gap-4 overflow-x-auto border-b border-zinc-800/10 dark:border-white/10'
// Inactive text is zinc-500 (4.75:1 on white, AA) rather than the lighter reference grey.
const TAB = '-mb-px inline-flex shrink-0 items-center border-b-2 border-transparent px-2 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white'
const SELECTED = 'border-(--color-accent-content) text-(--color-accent-content)'

export interface LinkTab {
  to: string
  label: string
  /** Match the route exactly (default) or as a prefix. */
  end?: boolean
}

export function LinkTabs({ tabs, label, className }: { tabs: readonly LinkTab[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx(ROW, className)}>
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end ?? true} className={({ isActive }) => cx(TAB, isActive && SELECTED)}>
          {tab.label}
        </NavLink>
      ))}
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
            className={cx(TAB, selected && SELECTED)}
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
            {typeof tab.count === 'number' && <span className="ms-1.5 text-xs text-zinc-500">{tab.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
