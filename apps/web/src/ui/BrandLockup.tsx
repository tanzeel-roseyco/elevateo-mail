// Sidebar brand lockup (DESIGN-SPEC §3, handoff branding/elevateo-logo.png = gold mark above
// "ELEVATEO CO."): the handoff mark on its dark tile beside the typeset wordmark at the 24px logo
// height EmailGuard uses. Typeset text inherits the slate colour in both themes; the mark artwork
// itself is never recoloured.
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
