// Sidebar brand lockup (DESIGN-SPEC §3): the authentic gold Elevateo mark on its dark tile beside a
// text wordmark, at the 24px logo height EmailGuard uses. The wordmark is typeset, not an image,
// so it inherits the slate text colour in both themes while the mark artwork stays untouched.
import { Link } from 'react-router'
import { cx } from '@/lib/format'
import { BrandMark } from './BrandMark'

export function BrandLockup({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cx('inline-flex h-6 items-center gap-2 rounded-md', className)} aria-label="Elevateo home">
      <BrandMark size={24} decorative className="rounded-md p-0.5" />
      <span className="text-sm font-semibold uppercase leading-none tracking-[0.18em] text-zinc-800 dark:text-white">Elevateo Co.</span>
    </Link>
  )
}
