// Flux card recipes (DESIGN-SPEC §5.3, §5.9): the plain white card, the dashboard stat card and the
// hub "link card" used by Settings › Workspace / Profile / Integrations and the help collections.
import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '@/lib/format'

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cx('rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900', className)} {...rest}>
      {children}
    </div>
  )
}

interface StatCardProps {
  label: string
  /** Pre-formatted value; use "—" when the server does not report the figure. */
  value: string
  /** Set when the value is a placeholder so screen readers hear why. */
  note?: string
}

export function StatCard({ label, value, note }: StatCardProps) {
  return (
    <Card className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-medium text-zinc-800 dark:text-white" aria-label={note ? `${label}: ${note}` : undefined}>{value}</p>
    </Card>
  )
}

interface LinkCardProps {
  to: string
  title: string
  text: string
  /** External links render an anchor and open in a new tab. */
  external?: boolean
  /** Static files (the Postman collection) render a same-tab download anchor. */
  download?: boolean
}

const LINK_CARD = 'block h-full rounded-xl border border-zinc-200 bg-white p-6 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800'

export function LinkCard({ to, title, text, external = false, download = false }: LinkCardProps) {
  const body = (
    <>
      <p className="text-sm font-medium text-zinc-800 dark:text-white">{title}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
    </>
  )
  if (download) {
    return (
      <a href={to} download className={LINK_CARD}>
        {body}
      </a>
    )
  }
  if (external) {
    return (
      <a href={to} target="_blank" rel="noreferrer noopener" className={LINK_CARD}>
        {body}
      </a>
    )
  }
  return (
    <Link to={to} className={LINK_CARD}>
      {body}
    </Link>
  )
}

/** Two-column grid of link cards (max-w-3xl, matching the settings hubs). */
export function LinkCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2', className)}>{children}</div>
}
