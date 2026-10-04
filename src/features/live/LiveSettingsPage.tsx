import { LogOut, Palette, UserCircle, type LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { live, useLive } from '@/data/http/instance'
import { AppearanceSettings } from '@/features/settings/AppearanceSettings'
import { cx } from '@/lib/format'
import { usePageTitle } from '@/ui/Bits'
import { Button } from '@/ui/Button'

function AccountPanel() {
  const capabilities = useLive((s) => s.capabilities)
  return (
    <div className="mt-4 flex flex-col gap-4 text-sm">
      <p className="text-[13px] text-muted">You are using a pilot session issued offline. Profile details, notification preferences and sender identities are not stored by the server yet, so they are not shown.</p>
      {capabilities && (
        <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line text-[13px]">
          {[
            ['Mail provider', capabilities.simulated ? 'Simulated: no real email is sent' : 'Live'],
            ['Sending', capabilities.dispatchPaused ? 'Paused on the server' : 'Enabled on the server'],
            ['Campaigns', capabilities.features.campaignWizard ? 'Available' : 'Not available'],
            ['Mailbox sync and history import', capabilities.features.inboxSync || capabilities.features.historyImport ? 'Available' : 'Not available'],
            ['AI assistant', capabilities.features.aiBridge ? 'Available' : 'Not available'],
            ['DNS changes', capabilities.dnsWrites ? 'Enabled' : 'Never made by the server'],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-3 px-4 py-2">
              <dt className="w-56 shrink-0 text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div>
        <Button onClick={() => live.signOut()} icon={<LogOut aria-hidden className="size-4" />}>
          Sign out
        </Button>
        <p className="mt-1.5 text-xs text-muted">Signing out clears the session and the drafts and send requests kept in this browser. Requests the server already holds are not affected.</p>
      </div>
    </div>
  )
}

const SECTIONS: Array<{ id: string; label: string; icon: LucideIcon; Panel: ComponentType }> = [
  { id: 'account', label: 'Account', icon: UserCircle, Panel: AccountPanel },
  { id: 'appearance', label: 'Appearance', icon: Palette, Panel: AppearanceSettings },
]

// AIDEV-NOTE: Only settings that are real in API-backed mode: the session and the local appearance preferences.
export function LiveSettingsPage() {
  const { section } = useParams()
  const active = SECTIONS.find((s) => s.id === section)
  usePageTitle(active ? `${active.label} settings` : 'Settings')
  if (!active) return <Navigate to="/settings/account" replace />

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
