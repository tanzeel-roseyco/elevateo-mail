// EmailGuard page header block (DESIGN-SPEC §4.2): title + subtitle on the start side, actions and
// the Get Help menu on the end side, hairline separator underneath. Every top-level page opens
// with this so the 1440px layout lines up with the reference (title at y≈38, 18px/28px).
import type { ReactNode } from 'react'
import { cx } from '@/lib/format'
import { GetHelpMenu } from './GetHelpMenu'
import { Separator } from './Separator'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Page-specific buttons rendered before the Get Help menu. */
  actions?: ReactNode
  /** Hide the Get Help menu (used inside the help centre itself). */
  help?: boolean
  className?: string
}

export function PageHeader({ title, subtitle, actions, help = true, className }: PageHeaderProps) {
  // Nesting mirrors the reference exactly (heading block and action row inside one flex-1 column,
  // separator underneath) so the 1440px title/button positions land within 1–2px.
  return (
    <div className={cx('mb-10 flex items-start max-md:flex-col', className)}>
      <div className="flex-1 self-stretch max-md:pt-6">
        <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
          <div className="min-w-0 space-y-1">
            <h1 tabIndex={-1} className={cx('text-lg font-medium text-zinc-800 dark:text-white', subtitle && 'mb-2')}>{title}</h1>
            {/* break-words: a subtitle that echoes user input (help search query) must wrap, not widen. */}
            {subtitle && <p className="break-words text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
          </div>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {actions}
            {help && <GetHelpMenu />}
          </div>
        </div>
        <Separator className="mt-4" />
      </div>
    </div>
  )
}

/** Section header inside a page ("Recent conversations" + "View All" button). */
export function SectionHeader({ title, subtitle, action, className }: { title: string; subtitle?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-5 mt-6 flex items-center justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-medium text-zinc-800 dark:text-white">{title}</h2>
        {subtitle && <p className="text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
