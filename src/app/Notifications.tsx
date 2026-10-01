import { Bell } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useData } from '@/data/store'
import { EVENT_LABELS, notifiableEvents } from '@/domain/activity'
import { formatWhen } from '@/lib/format'
import { IconButton } from '@/ui/Button'
import { eventHref } from '@/lib/routes'

const MENU_SIZE = 8

/** In-app notification menu. Driven by Settings → Notifications; independent of browser push permission. */
export function Notifications() {
  const events = useData((s) => s.events)
  const prefs = useData((s) => s.settings.notifications)
  const seenAt = useData((s) => s.settings.notificationsSeenAt)
  const updateSettings = useData((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  const threads = useData((s) => s.threads)
  const all = useMemo(() => notifiableEvents(events, prefs), [events, prefs])
  const items = all.slice(0, MENU_SIZE)
  // Counted over everything, not just the rows shown: opening the menu marks all of them as seen.
  const unseen = all.filter((e) => e.at > seenAt).length

  const toggle = () => {
    // Opening the menu is what marks notifications as seen.
    if (!open) updateSettings({ notificationsSeenAt: new Date().toISOString() })
    setOpen(!open)
  }

  return (
    <div ref={container} className="relative" onBlur={(e) => !container.current?.contains(e.relatedTarget) && setOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <IconButton label={unseen > 0 ? `Notifications, ${unseen} new` : 'Notifications'} aria-expanded={open} aria-haspopup="true" onClick={toggle} className="relative size-10">
        <Bell aria-hidden className="size-[18px]" />
        {unseen > 0 && (
          <span aria-hidden className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-danger-fg">
            {unseen > 99 ? '99+' : unseen}
          </span>
        )}
      </IconButton>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line bg-surface shadow-xl">
          <h2 className="border-b border-line px-3.5 py-2.5 text-sm font-semibold">Notifications</h2>
          {items.length === 0 ? (
            <p className="px-3.5 py-5 text-[13px] text-muted">Nothing to show. Choose what appears here in Settings → Notifications.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {items.map((e) => (
                <li key={e.id}>
                  <Link to={eventHref(e, threads)} onClick={() => setOpen(false)} className="block px-3.5 py-2 text-[13px] hover:bg-surface-2">
                    <span className="font-medium">{e.kind === 'campaign' ? e.text : EVENT_LABELS[e.kind]}</span>
                    <span className="block truncate text-muted">
                      {e.email || e.domain} · {formatWhen(e.at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between border-t border-line px-3.5 py-2.5 text-[13px] font-medium text-accent-text">
            <Link to="/settings/notifications" onClick={() => setOpen(false)}>
              Notification settings
            </Link>
            {all.length > MENU_SIZE && (
              <Link to="/activity?range=all" onClick={() => setOpen(false)}>
                All activity
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
