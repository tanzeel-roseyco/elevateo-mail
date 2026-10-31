// Corporate brand lockup uses the canonical artwork on white beside a near-black wordmark.
// AIDEV-NOTE: Artwork is never recoloured; the decorative image avoids a duplicate accessible name.
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
      <span className="text-sm font-semibold uppercase leading-none tracking-[0.18em] text-fg ">Elevateo Co.</span>
    </>
  )
  if (!linked) return <span className={cx(LOCKUP, className)}>{body}</span>
  return (
    <Link to={to} className={cx(LOCKUP, className)} aria-label="Elevateo home">
      {body}
    </Link>
  )
}
