// Sidebar brand lockup (DESIGN-SPEC §3, handoff branding/elevateo-logo.png = gold mark above
// "ELEVATEO CO."): the handoff mark on its dark tile beside the typeset wordmark at the 24px logo
// height EmailGuard uses. Typeset text inherits the slate colour in both themes; the mark artwork
// itself is never recoloured.
import { Link } from 'react-router'
import { cx } from '@/lib/format'
import { BrandMark } from './BrandMark'

const LOCKUP = 'inline-flex h-6 items-center gap-2 rounded-md'

/**
 * `linked` (default) renders a router Link home. The signed-out auth frame passes false: it renders
 * before/outside the router and a signed-out visitor has no in-app home to go to.
 */
export function BrandLockup({ to = '/', className, linked = true }: { to?: string; className?: string; linked?: boolean }) {
  const body = (
    <>
      <BrandMark size={24} decorative className="rounded-md p-0.5" />
      <span className="text-sm font-semibold uppercase leading-none tracking-[0.18em] text-zinc-800 dark:text-white">Elevateo Co.</span>
    </>
  )
  if (!linked) return <span className={cx(LOCKUP, className)}>{body}</span>
  return (
    <Link to={to} className={cx(LOCKUP, className)} aria-label="Elevateo home">
      {body}
    </Link>
  )
}
