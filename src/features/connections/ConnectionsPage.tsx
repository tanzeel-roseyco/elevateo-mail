import { Bot, Globe, Inbox, Search, Send, type LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { gateway } from '@/data/gateway'
import { cx } from '@/lib/format'
import { LoadGate, useLoad } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { usePageTitle } from '@/ui/Bits'
import { AiSection } from './AiSection'
import { DomainsSection } from './DomainsSection'
import { EnrichmentSection } from './EnrichmentSection'
import { MailboxesSection } from './MailboxesSection'
import { SendingSection } from './SendingSection'

const SECTIONS: Array<{ id: string; label: string; icon: LucideIcon; Panel: ComponentType }> = [
  { id: 'mailboxes', label: 'Mailboxes', icon: Inbox, Panel: MailboxesSection },
  { id: 'sending', label: 'Sending', icon: Send, Panel: SendingSection },
  { id: 'ai', label: 'AI', icon: Bot, Panel: AiSection },
  { id: 'enrichment', label: 'Enrichment', icon: Search, Panel: EnrichmentSection },
  { id: 'domains', label: 'Domains', icon: Globe, Panel: DomainsSection },
]

// AIDEV-NOTE: Everything a backend will connect lives here. All of it is a labelled preview: no account, key or DNS is touched.
export function ConnectionsPage() {
  const { section } = useParams()
  const active = SECTIONS.find((s) => s.id === section)
  usePageTitle(active ? `${active.label} · Connections` : 'Connections')
  const { state, retry } = useLoad(gateway.loadConnections)
  if (!active) return <Navigate to="/connections/mailboxes" replace />

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <nav aria-label="Connections sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3">
        <h1 className="hidden px-3 pb-2 text-base font-semibold md:block">Connections</h1>
        {SECTIONS.map((s) => (
          <Link key={s.id} to={`/connections/${s.id}`} aria-current={s.id === active.id ? 'page' : undefined} className={cx('flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-[13px]', s.id === active.id ? 'bg-accent-soft font-semibold text-accent-text' : 'hover:bg-surface-2')}>
            <s.icon aria-hidden className="size-4 shrink-0" />
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-3xl p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{active.label}</h2>
            <Badge tone="warn">Preview · nothing is connected</Badge>
          </div>
          <LoadGate state={state} retry={retry} errorTitle="Connections could not be loaded">
            <active.Panel />
          </LoadGate>
        </div>
      </div>
    </div>
  )
}
