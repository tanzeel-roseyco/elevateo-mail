import { AtSign, Bell, Palette, Send, UserCircle, type LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { cx } from '@/lib/format'
import { usePageTitle } from '@/ui/Bits'
import { AccountSettings } from './AccountSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { IdentitySettings } from './IdentitySettings'
import { NotificationSettings } from './NotificationSettings'
import { SendingSettings } from './SendingSettings'

const SECTIONS: Array<{ id: string; label: string; icon: LucideIcon; Panel: ComponentType }> = [
  { id: 'appearance', label: 'Appearance', icon: Palette, Panel: AppearanceSettings },
  { id: 'identities', label: 'Sender identities', icon: AtSign, Panel: IdentitySettings },
  { id: 'notifications', label: 'Notifications', icon: Bell, Panel: NotificationSettings },
  { id: 'sending', label: 'Sending and unsubscribe', icon: Send, Panel: SendingSettings },
  { id: 'account', label: 'Account', icon: UserCircle, Panel: AccountSettings },
]

export function SettingsPage() {
  const { section } = useParams()
  const active = SECTIONS.find((s) => s.id === section)
  usePageTitle(active ? `${active.label} settings` : 'Settings')
  if (!active) return <Navigate to="/settings/appearance" replace />

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3">
        <h1 className="hidden px-3 pb-2 text-base font-semibold md:block">Settings</h1>
        {SECTIONS.map((s) => (
          <Link key={s.id} to={`/settings/${s.id}`} aria-current={s.id === active.id ? 'page' : undefined} className={cx('flex h-9 shrink-0 items-center gap-2.5 rounded-full px-3 text-[13px]', s.id === active.id ? 'bg-accent-soft font-semibold text-accent-text' : 'hover:bg-surface-2')}>
            <s.icon aria-hidden className="size-4 shrink-0" />
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-3xl p-4 md:p-6">
          <h2 className="text-xl font-semibold tracking-tight">{active.label}</h2>
          <active.Panel />
        </div>
      </div>
    </div>
  )
}
