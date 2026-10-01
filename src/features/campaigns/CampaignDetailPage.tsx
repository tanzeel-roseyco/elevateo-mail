import { ChevronRight, FastForward, Megaphone, Pause, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { gateway } from '@/data/gateway'
import { useData } from '@/data/store'
import { campaignMetrics, nextAction } from '@/domain/rules'
import type { Campaign } from '@/domain/schema'
import { cx, formatDateTime } from '@/lib/format'
import { StatusBadge } from '@/ui/Badge'
import { EmptyState, usePageTitle } from '@/ui/Bits'
import { Button, buttonClass } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { toast } from '@/ui/toast'
import { ActivityTab, EmailsTab, OverviewTab, RecipientsTab, RepliesTab, SettingsTab } from './CampaignTabs'

const TABS = [
  { id: 'overview', label: 'Overview', Panel: OverviewTab },
  { id: 'recipients', label: 'Recipients', Panel: RecipientsTab },
  { id: 'emails', label: 'Emails', Panel: EmailsTab },
  { id: 'replies', label: 'Replies', Panel: RepliesTab },
  { id: 'activity', label: 'Activity', Panel: ActivityTab },
  { id: 'settings', label: 'Settings', Panel: SettingsTab },
] as const

/** Start / pause / resume / simulate-batch controls. All state changes are local simulations. */
function Controls({ campaign }: { campaign: Campaign }) {
  const deleteCampaign = useData((s) => s.deleteCampaign)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const { pending, total } = campaignMetrics(campaign)

  const setStatus = async (status: 'running' | 'paused', message: string) => {
    setBusy(true)
    try {
      await gateway.setCampaignStatus(campaign.id, status)
      toast(message, { tone: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The campaign could not be updated.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const runBatch = async () => {
    setBusy(true)
    try {
      const { processed, completed } = await gateway.runCampaignBatch(campaign.id)
      toast(completed ? `Campaign completed. ${processed} final messages simulated.` : `Simulated one sending day: ${processed} messages marked delivered.`, { tone: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The batch could not be simulated.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this campaign?', body: `“${campaign.name}” and its recipient statuses will be removed. Conversations already in Mail are kept.`, confirmLabel: 'Delete campaign', danger: true }))) return
    deleteCampaign(campaign.id)
    toast('Campaign deleted.')
    navigate('/campaigns')
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
        <Button variant="primary" icon={<Play aria-hidden className="size-4" />} disabled={busy || total === 0} title={total === 0 ? 'Add recipients before starting' : undefined} onClick={() => void setStatus('running', 'Campaign started (simulated).')}>
          Start now
        </Button>
      )}
      {campaign.status === 'running' && (
        <>
          <Button variant="primary" icon={<FastForward aria-hidden className="size-4" />} disabled={busy || pending === 0} onClick={() => void runBatch()}>
            {busy ? 'Simulating…' : 'Simulate next batch'}
          </Button>
          <Button icon={<Pause aria-hidden className="size-4" />} disabled={busy} onClick={() => void setStatus('paused', 'Campaign paused.')}>
            Pause
          </Button>
        </>
      )}
      {campaign.status === 'paused' && (
        <Button variant="primary" icon={<Play aria-hidden className="size-4" />} disabled={busy} onClick={() => void setStatus('running', 'Campaign resumed (simulated).')}>
          Resume
        </Button>
      )}
      {campaign.status !== 'running' && (
        <Button icon={<Trash2 aria-hidden className="size-4" />} onClick={() => void remove()}>
          Delete
        </Button>
      )}
    </div>
  )
}

export function CampaignDetailPage() {
  const { campaignId, tab } = useParams()
  const campaign = useData((s) => s.campaigns.find((c) => c.id === campaignId))
  usePageTitle(campaign?.name ?? 'Campaign not found')

  if (!campaign) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Campaign not found"
        body="It may have been deleted, or the link is incorrect."
        action={
          <Link to="/campaigns" className={buttonClass('primary')}>
            Back to campaigns
          </Link>
        }
      />
    )
  }

  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-4 pt-3 md:px-6">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 text-[13px] text-muted">
            <li>
              <Link to="/campaigns" className="underline underline-offset-2 hover:text-fg">
                Campaigns
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li aria-current="page" className="truncate text-fg">
              {campaign.name}
            </li>
          </ol>
        </nav>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{campaign.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <StatusBadge status={campaign.status} />
              {nextAction(campaign, formatDateTime)}
            </p>
          </div>
          <Controls campaign={campaign} />
        </div>
        <nav aria-label="Campaign sections" className="-mb-px mt-3 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link key={t.id} to={`/campaigns/${campaign.id}/${t.id}`} aria-current={t.id === active.id ? 'page' : undefined} className={cx('shrink-0 border-b-2 px-3 py-2 text-[13px]', t.id === active.id ? 'border-accent-text font-semibold text-accent-text' : 'border-transparent text-muted hover:text-fg')}>
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {/* Keyed by campaign so a tab's form state never carries over to a different campaign. */}
        <active.Panel key={campaign.id} campaign={campaign} />
      </div>
    </div>
  )
}
