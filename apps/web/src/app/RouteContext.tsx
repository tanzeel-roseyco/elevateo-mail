// Context strip above every routed page (2026-10-18 IA refresh): the nav group and crumb, one line
// saying what the screen is for, and a back link on nested screens. Data comes from the pure
// describeRoute() table; mailbox names come from the already-loaded shell snapshot.
import { Link, useLocation } from 'react-router'
import { BackIcon } from '@/ui/icons'
import { useMailboxes } from './mailboxes'
import { describeRoute } from './pageMeta'

export function RouteContext() {
  const { pathname } = useLocation()
  const snapshot = useMailboxes()
  const mailboxName = (id: string) =>
    (snapshot.status === 'ready' ? snapshot.mailboxes.find((m) => m.id === id)?.display_name : undefined) ?? 'Mailbox'
  const meta = describeRoute(pathname, mailboxName)
  if (meta === null) return null
  return (
    <div className="border-b border-line bg-surface/60 px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {meta.back && (
          <Link to={meta.back.to} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md pr-2 text-[13px] font-medium text-accent-text hover:bg-surface-2">
            <BackIcon aria-hidden className="size-4" />
            {meta.back.label}
          </Link>
        )}
        {/* Breadcrumb names the place; the page h1 stays the title. No aria-current here: the rail owns the single current link. */}
        <nav aria-label="Breadcrumb" className="min-w-0 text-[13px]">
          <ol className="flex min-w-0 items-center gap-1.5">
            <li className="shrink-0 text-muted">{meta.group}</li>
            <li aria-hidden className="text-muted">/</li>
            <li className="min-w-0 truncate font-medium">{meta.crumb}</li>
          </ol>
        </nav>
      </div>
      <p className="mt-0.5 text-[13px] leading-snug text-muted">{meta.purpose}</p>
    </div>
  )
}
