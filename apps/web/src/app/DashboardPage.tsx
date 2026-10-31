// Dashboard (DESIGN-SPEC §4.3, reference source-html/app/dashboard.html): page header, announcement
// callout, five stat cards and "recent" sections with "View All" buttons. Every figure is a real
// read through the gateways; what the server does not report is shown as "—" with a note rather
// than an invented number.
//
// AIDEV-NOTE: Counts read only the FIRST page of each list (one request per mailbox, ≤10 mailboxes
// per user) and show "N+" when a continuation exists; walking every page here would be a hot loop.
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { Mailbox, ThreadSummary } from '@/data/contract'
import { campaignPageSchema, type Campaign } from '@/features/outreach/contract'
import { formatWhen } from '@/lib/format'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Button, buttonClass } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Card, StatCard } from '@/ui/Card'
import { ArrowUpRightMicroIcon, EnvelopeIcon, ExclamationTriangleIcon, PaperAirplaneIcon, XMarkIcon } from '@/ui/icons'
import { PageHeader, SectionHeader } from '@/ui/PageHeader'
import { Table, TD, TH } from '@/ui/Table'
import { useFeatureGateways } from './featureGateways'
import { useMailboxes } from './mailboxes'
import { useProtectedRequest } from './protectedRequest'
import { useGateway, useSession } from './session'

/** Product rule: each connected mailbox sends at most this many emails per day. */
export const DAILY_SEND_LIMIT_PER_MAILBOX = 30
/** Rows shown in each "recent" section before the View All link. */
const RECENT_LIMIT = 5

interface Count {
  readonly value: number
  /** True when the server has more items than the first page returned. */
  readonly more: boolean
}

type MailboxCounts =
  | { status: 'loading' }
  | { status: 'ready'; unread: Count; drafts: Count | null; recent: readonly ThreadSummary[] }
  | { status: 'error' }

const fmt = (count: Count) => `${count.value}${count.more ? '+' : ''}`

function useMailboxCounts(mailboxes: readonly Mailbox[]): Record<string, MailboxCounts> {
  const gateway = useGateway()
  const { request } = useProtectedRequest()
  const [counts, setCounts] = useState<Record<string, MailboxCounts>>({})
  useEffect(() => {
    let live = true
    setCounts(Object.fromEntries(mailboxes.map((m) => [m.id, { status: 'loading' } as const])))
    for (const mailbox of mailboxes) {
      void request(async (ctx, signal) => {
        const unread = await gateway.listThreads(ctx, mailbox.id, { filter: 'unread' }, signal)
        const drafts = mailbox.capabilities.compose ? await gateway.listDrafts(ctx, mailbox.id, {}, signal) : null
        return {
          unread: { value: unread.items.length, more: unread.next_cursor != null },
          drafts: drafts === null ? null : { value: drafts.items.length, more: drafts.next_cursor != null },
          recent: unread.items,
        }
      }).then((outcome) => {
        if (!live || outcome.kind === 'stale') return
        const next: MailboxCounts = outcome.kind === 'ok' ? { status: 'ready', ...outcome.value } : { status: 'error' }
        setCounts((prev) => ({ ...prev, [mailbox.id]: next }))
      })
    }
    return () => {
      live = false
    }
  }, [gateway, request, mailboxes])
  return counts
}

type CampaignsState = { status: 'unavailable' } | { status: 'loading' } | { status: 'ready'; items: Campaign[]; more: boolean } | { status: 'error'; message: string }

function useRecentCampaigns(): [CampaignsState, () => void] {
  const { outreach } = useFeatureGateways()
  const { request } = useProtectedRequest()
  const [state, setState] = useState<CampaignsState>(outreach === undefined ? { status: 'unavailable' } : { status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (outreach === undefined) {
      setState({ status: 'unavailable' })
      return
    }
    let live = true
    setState({ status: 'loading' })
    void request((ctx, signal) => outreach.listCampaigns(ctx, { limit: RECENT_LIMIT }, signal)).then((outcome) => {
      if (!live || outcome.kind === 'stale') return
      if (outcome.kind === 'failed') {
        setState({ status: 'error', message: 'Campaigns could not be loaded.' })
        return
      }
      // The outreach port returns unknown by contract; validate at this boundary before rendering.
      const parsed = campaignPageSchema.safeParse(outcome.value)
      if (!parsed.success) {
        setState({ status: 'error', message: 'The campaign list did not match the expected shape.' })
        return
      }
      setState({ status: 'ready', items: parsed.data.items.slice(0, RECENT_LIMIT), more: parsed.data.next_cursor != null || parsed.data.items.length > RECENT_LIMIT })
    })
    return () => {
      live = false
    }
  }, [outreach, request, attempt])
  return [state, () => setAttempt((n) => n + 1)]
}

// AIDEV-NOTE: A failed mailbox read makes the total a lower bound ("12+"), never an exact figure;
// when nothing could be counted the card shows "—" (review finding, 2026-10-19).
function sum(entries: readonly MailboxCounts[], pick: (c: Extract<MailboxCounts, { status: 'ready' }>) => Count | null): string {
  if (entries.some((c) => c.status === 'loading')) return '…'
  if (entries.length > 0 && entries.every((c) => c.status === 'error')) return '—'
  let value = 0
  let more = false
  for (const c of entries) {
    if (c.status === 'error') {
      more = true
      continue
    }
    if (c.status !== 'ready') continue
    const count = pick(c)
    if (count === null) continue
    value += count.value
    more ||= count.more
  }
  return fmt({ value, more })
}

function ViewAllButton({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className={`${buttonClass('outline', 'xs')} pe-3 ps-4`}>
      <span>{children}</span>
      <ArrowUpRightMicroIcon className="size-4" />
    </Link>
  )
}

const ANNOUNCEMENT_KEY = 'elevateo.dashboard.announcement.help-centre'

function Announcement() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(ANNOUNCEMENT_KEY) === '1'
    } catch {
      return false
    }
  })
  if (dismissed) return null
  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(ANNOUNCEMENT_KEY, '1')
    } catch {
      // Per-browser convenience only; a blocked store just shows the banner again next time.
    }
  }
  return (
    <Callout variant="accent" icon={false} className="mb-6" role="note">
      <div className="flex items-center justify-between gap-4">
        <Link to="/help/collections/mcp" className="flex flex-1 items-center justify-center gap-2 text-center text-sm leading-6 text-fg hover:underline ">
          <Badge tone="accent">New</Badge>
          <strong className="text-base font-medium">Elevateo MCP connector guide is live</strong>
          <span className="text-base max-sm:hidden">– connect Claude, Cursor and other AI tools</span>
          <ArrowUpRightMicroIcon className="size-4" />
        </Link>
        <button type="button" aria-label="Dismiss" onClick={dismiss} className="rounded-md text-fg hover:opacity-75 ">
          <XMarkIcon className="size-5" />
        </button>
      </div>
    </Callout>
  )
}

function RecentConversations({ mailboxes, counts }: { mailboxes: readonly Mailbox[]; counts: Record<string, MailboxCounts> }) {
  const entries = mailboxes.map((m) => counts[m.id] ?? ({ status: 'loading' } as const))
  if (entries.some((c) => c.status === 'loading')) return <div role="status" aria-label="Loading conversations"><Skeleton rows={3} /></div>
  const failed = entries.some((c) => c.status === 'error')
  const rows = mailboxes
    .flatMap((mailbox) => {
      const c = counts[mailbox.id]
      return c?.status === 'ready' ? c.recent.map((thread) => ({ mailbox, thread })) : []
    })
    .sort((a, b) => (b.thread.last_message_at ?? '').localeCompare(a.thread.last_message_at ?? ''))
    .slice(0, RECENT_LIMIT)
  if (rows.length === 0 && failed) {
    // A failed read must not look like "caught up": the mailbox may well have unread mail.
    return (
      <EmptyState
        icon={<ExclamationTriangleIcon className="size-5" />}
        title="Recent conversations could not be loaded"
        body="At least one mailbox did not answer. Open the inbox to read it directly, or reload this page."
        action={<Link to="/inbox" className={buttonClass('primary', 'md')}>Open inbox</Link>}
      />
    )
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<EnvelopeIcon className="size-5" />}
        title="No unread conversations"
        body="You are caught up. New replies will appear here as they arrive."
        action={<Link to="/inbox" className={buttonClass('primary', 'md')}>Open inbox</Link>}
      />
    )
  }
  return (
    <Card className="p-0 px-6">
      <Table>
        <thead>
          <tr>
            <TH>From</TH>
            <TH>Subject</TH>
            <TH className="max-md:hidden">Mailbox</TH>
            <TH className="text-end">Received</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ mailbox, thread }) => (
            <tr key={thread.id}>
              <TD className="whitespace-nowrap font-medium">{thread.sender?.display_name ?? thread.sender?.address ?? 'Unknown sender'}</TD>
              <TD>
                <Link to={`/mailboxes/${mailbox.id}/threads/${thread.id}`} className="hover:underline">
                  {thread.subject ?? '(no subject)'}
                </Link>
              </TD>
              <TD className="text-muted max-md:hidden">{mailbox.display_name}</TD>
              <TD className="whitespace-nowrap text-end text-muted">{thread.last_message_at ? formatWhen(thread.last_message_at) : '—'}</TD>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  )
}

function MailboxRows({ mailboxes, counts }: { mailboxes: readonly Mailbox[]; counts: Record<string, MailboxCounts> }) {
  return (
    <Card className="p-0 px-6">
      <Table>
        <thead>
          <tr>
            <TH>Mailbox</TH>
            <TH className="max-md:hidden">Address</TH>
            <TH className="text-end">Unread</TH>
            <TH className="text-end max-sm:hidden">Drafts</TH>
          </tr>
        </thead>
        <tbody>
          {mailboxes.map((mailbox) => {
            const c = counts[mailbox.id]
            return (
              <tr key={mailbox.id}>
                <TD className="font-medium">
                  <Link to={`/mailboxes/${mailbox.id}`} className="hover:underline">{mailbox.display_name}</Link>
                </TD>
                <TD className="text-muted max-md:hidden">{mailbox.display_address ?? '—'}</TD>
                <TD className="text-end tabular-nums">
                  {c?.status === 'ready' ? (
                    <Link to={`/mailboxes/${mailbox.id}?filter=unread`} className="hover:underline" aria-label={`${fmt(c.unread)} unread in ${mailbox.display_name}`}>{fmt(c.unread)}</Link>
                  ) : c?.status === 'error' ? (
                    <span className="text-danger">Unavailable</span>
                  ) : (
                    '…'
                  )}
                </TD>
                <TD className="text-end tabular-nums max-sm:hidden">
                  {c?.status === 'ready' ? (c.drafts === null ? '—' : <Link to={`/mailboxes/${mailbox.id}/drafts`} className="hover:underline">{fmt(c.drafts)}</Link>) : c?.status === 'error' ? '—' : '…'}
                </TD>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </Card>
  )
}

function RecentCampaigns({ state, retry }: { state: CampaignsState; retry(): void }) {
  if (state.status === 'loading') return <div role="status" aria-label="Loading campaigns"><Skeleton rows={3} /></div>
  if (state.status === 'error') return <ErrorState title="Campaigns could not be loaded" body={state.message} action={<Button variant="primary" onClick={retry}>Try again</Button>} />
  if (state.status === 'unavailable' || state.items.length === 0) {
    return (
      <EmptyState
        icon={<PaperAirplaneIcon className="size-5" />}
        title={state.status === 'unavailable' ? 'Outreach is not connected' : 'No campaigns yet'}
        body={state.status === 'unavailable' ? 'Campaigns cannot be created until the Outreach API is connected to this workspace.' : 'Create a campaign to plan your first outreach sequence.'}
        action={state.status === 'unavailable' ? <Link to="/outreach/campaigns" className={buttonClass('outline', 'md')}>Open campaigns</Link> : <Link to="/outreach/campaigns/new" className={buttonClass('primary', 'md')}>Create campaign</Link>}
      />
    )
  }
  return (
    <Card className="p-0 px-6">
      <Table>
        <thead>
          <tr>
            <TH>Campaign</TH>
            <TH className="text-end">Status</TH>
          </tr>
        </thead>
        <tbody>
          {state.items.map((campaign) => (
            <tr key={campaign.id}>
              <TD className="font-medium">
                <Link to={`/outreach/campaigns/${campaign.id}`} className="hover:underline">{campaign.name}</Link>
              </TD>
              <TD className="text-end">
                <Badge tone={campaign.status === 'paused' ? 'warn' : 'neutral'} size="sm">{campaign.status === 'paused' ? 'Paused' : 'Draft'}</Badge>
              </TD>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  )
}

function Dashboard({ mailboxes, name }: { mailboxes: readonly Mailbox[]; name: string }) {
  const counts = useMailboxCounts(mailboxes)
  const [campaigns, retryCampaigns] = useRecentCampaigns()
  const entries = mailboxes.map((m) => counts[m.id] ?? ({ status: 'loading' } as const))
  const failed = entries.filter((c) => c.status === 'error').length
  const campaignCount = campaigns.status === 'ready' ? `${campaigns.items.length}${campaigns.more ? '+' : ''}` : campaigns.status === 'loading' ? '…' : '—'
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome ${name}`} />
      <Announcement />
      {failed > 0 && (
        <Callout variant="danger" role="alert" className="mb-6">
          Counts for {failed} mailbox{failed === 1 ? '' : 'es'} could not be loaded. Open the mailbox to read it directly, or reload this page to try again.
        </Callout>
      )}
      {/* AIDEV-NOTE: The reference is a fixed grid-cols-5; 2/3/5 columns keep 390px usable (coordinator QA). */}
      <section aria-label="Workspace summary" className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Mailboxes" value={String(mailboxes.length)} />
        <StatCard label="Unread replies" value={sum(entries, (c) => c.unread)} />
        <StatCard label="Open drafts" value={sum(entries, (c) => c.drafts)} />
        <StatCard label="Daily send limit" value={String(mailboxes.length * DAILY_SEND_LIMIT_PER_MAILBOX)} note={`${DAILY_SEND_LIMIT_PER_MAILBOX} per mailbox; usage so far is not reported by the server`} />
        <StatCard label="Campaigns" value={campaignCount} {...(campaigns.status === 'unavailable' ? { note: 'Outreach is not connected' } : {})} />
      </section>

      <div className="mt-4">
        <SectionHeader title="Recent conversations" subtitle="Latest unread conversations across your mailboxes" action={<ViewAllButton to="/inbox">View All Conversations</ViewAllButton>} />
        <RecentConversations mailboxes={mailboxes} counts={counts} />
      </div>

      <div className="mt-4">
        <SectionHeader title="Your mailboxes" subtitle={`Each mailbox sends at most ${DAILY_SEND_LIMIT_PER_MAILBOX} emails a day`} action={<ViewAllButton to="/inbox">View All Mailboxes</ViewAllButton>} />
        <MailboxRows mailboxes={mailboxes} counts={counts} />
      </div>

      <div className="mt-4">
        <SectionHeader title="Recent campaigns" subtitle="Outreach campaigns and their short follow-up sequences" action={<ViewAllButton to="/outreach/campaigns">View All Campaigns</ViewAllButton>} />
        <RecentCampaigns state={campaigns} retry={retryCampaigns} />
      </div>
    </>
  )
}

export function DashboardPage() {
  const snapshot = useMailboxes()
  const { state } = useSession()
  const name = state.status === 'ready' ? (state.session.actor.display_name ?? 'back') : 'back'
  // AIDEV-NOTE: Only a completed mailbox traversal establishes zero visible mailboxes.
  if (snapshot.status === 'loading') {
    return (
      <>
        <PageHeader title="Dashboard" subtitle={`Welcome ${name}`} />
        <div role="status" aria-label="Loading mailbox selection"><Skeleton rows={4} /></div>
      </>
    )
  }
  if (snapshot.status === 'error') {
    return (
      <>
        <PageHeader title="Dashboard" subtitle={`Welcome ${name}`} />
        <ErrorState title="Mailboxes could not be loaded" body="Use Try again in the navigation, or reload the page." action={<Button variant="primary" onClick={() => window.location.reload()}>Reload page</Button>} />
      </>
    )
  }
  if (snapshot.mailboxes.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle={`Welcome ${name}`} />
        <EmptyState
          icon={<EnvelopeIcon className="size-5" />}
          title="No visible mailboxes"
          body="If you expected a mailbox here, ask your organization administrator to check your access."
          action={<Link to="/settings/workspace" className={buttonClass('primary', 'md')}>Open workspace settings</Link>}
        />
      </>
    )
  }
  return <Dashboard mailboxes={snapshot.mailboxes} name={name} />
}
