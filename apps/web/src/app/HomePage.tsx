// "Today" home screen (2026-10-18 IA refresh). Replaces the old "Select a mailbox" placeholder with
// what needs attention: unread replies and open drafts per mailbox (real reads through the gateway),
// plus the daily send limit. Quota usage, approvals and failures are not served by the current API,
// so those tiles say so plainly instead of showing invented numbers.
//
// AIDEV-NOTE: Counts read only the FIRST page of each list (one request per mailbox, ≤10 mailboxes
// per user) and show "N+" when a continuation exists; walking every page here would be a hot loop.
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { Mailbox } from '@/data/contract'
import { EmptyState, Skeleton } from '@/ui/Async'
import { ChevronRightIcon, DraftIcon, InboxIcon } from '@/ui/icons'
import { useGateway } from './session'
import { useMailboxes } from './mailboxes'
import { useProtectedRequest } from './protectedRequest'

/** Product rule: each connected mailbox sends at most this many emails per day. */
export const DAILY_SEND_LIMIT_PER_MAILBOX = 30

interface Count {
  readonly value: number
  /** True when the server has more items than the first page returned. */
  readonly more: boolean
}

type MailboxCounts = { status: 'loading' } | { status: 'ready'; unread: Count; drafts: Count | null } | { status: 'error' }

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
        }
      }).then((outcome) => {
        if (!live || outcome.kind === 'stale') return
        const next: MailboxCounts = outcome.kind === 'ok' ? { status: 'ready', ...outcome.value } : { status: 'error' }
        setCounts((prev) => ({ ...prev, [mailbox.id]: next }))
      })
    }
    return () => { live = false }
  }, [gateway, request, mailboxes])
  return counts
}

function sum(entries: readonly MailboxCounts[], pick: (c: Extract<MailboxCounts, { status: 'ready' }>) => Count | null): string {
  if (entries.some((c) => c.status === 'loading')) return '…'
  let value = 0
  let more = false
  for (const c of entries) {
    if (c.status !== 'ready') continue
    const count = pick(c)
    if (count === null) continue
    value += count.value
    more ||= count.more
  }
  return fmt({ value, more })
}

function Tile({ label, value, hint, to }: { label: string; value: string; hint: string; to?: string }) {
  const body = (
    <>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[12px] leading-snug text-muted">{hint}</p>
    </>
  )
  return to === undefined
    ? <div className="panel p-4">{body}</div>
    : <Link to={to} className="panel block p-4 transition hover:shadow-2">{body}</Link>
}

function MailboxRow({ mailbox, counts }: { mailbox: Mailbox; counts: MailboxCounts | undefined }) {
  const status = counts?.status ?? 'loading'
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <InboxIcon aria-hidden className="size-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <Link to={`/mailboxes/${mailbox.id}`} className="block truncate font-medium hover:underline">{mailbox.display_name}</Link>
        <p className="truncate text-[12px] text-muted">{mailbox.display_address}</p>
      </div>
      {status === 'loading' && <span className="text-[12px] text-muted">Loading…</span>}
      {status === 'error' && <span className="text-[12px] text-danger">Counts unavailable</span>}
      {counts?.status === 'ready' && (
        <div className="flex shrink-0 items-center gap-2 text-[13px]">
          <Link to={`/mailboxes/${mailbox.id}?filter=unread`} className="rounded-md px-2 py-1 hover:bg-surface-2" aria-label={`${fmt(counts.unread)} unread in ${mailbox.display_name}`}>
            <span className="font-semibold tabular-nums">{fmt(counts.unread)}</span> <span className="text-muted">unread</span>
          </Link>
          {counts.drafts !== null && (
            <Link to={`/mailboxes/${mailbox.id}/drafts`} className="hidden items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-2 sm:inline-flex" aria-label={`${fmt(counts.drafts)} drafts in ${mailbox.display_name}`}>
              <DraftIcon aria-hidden className="size-4 text-muted" />
              <span className="font-semibold tabular-nums">{fmt(counts.drafts)}</span>
            </Link>
          )}
          <ChevronRightIcon aria-hidden className="size-4 text-muted" />
        </div>
      )}
    </li>
  )
}

function Today({ mailboxes }: { mailboxes: readonly Mailbox[] }) {
  const counts = useMailboxCounts(mailboxes)
  const entries = mailboxes.map((m) => counts[m.id] ?? ({ status: 'loading' } as const))
  const failed = entries.filter((c) => c.status === 'error').length
  const first = mailboxes[0]
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="page-title">Today</h1>
      {failed > 0 && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          Counts for {failed} mailbox{failed === 1 ? '' : 'es'} could not be loaded. Open the mailbox to read it directly, or reload this page to try again.
        </p>
      )}
      <section aria-label="Attention summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Unread replies" value={sum(entries, (c) => c.unread)} hint="Conversations not yet opened, across all mailboxes." {...(first ? { to: `/mailboxes/${first.id}?filter=unread` } : {})} />
        <Tile label="Open drafts" value={sum(entries, (c) => c.drafts)} hint="Unsent drafts you can finish or send for review." />
        <Tile
          label="Daily send limit"
          value={`${mailboxes.length * DAILY_SEND_LIMIT_PER_MAILBOX}`}
          hint={`${DAILY_SEND_LIMIT_PER_MAILBOX} per mailbox × ${mailboxes.length}. Usage so far is not reported by the server yet.`}
        />
        <Tile label="Approvals and failures" value="—" hint="Not reported by the server yet. Each draft's send review shows its own status." />
      </section>
      <section aria-labelledby="home-mailboxes" className="flex flex-col gap-2">
        <h2 id="home-mailboxes" className="text-[15px] font-semibold">Your mailboxes</h2>
        <ul className="panel divide-y divide-line overflow-hidden">
          {mailboxes.map((mailbox) => <MailboxRow key={mailbox.id} mailbox={mailbox} counts={counts[mailbox.id]} />)}
        </ul>
      </section>
    </div>
  )
}

export function HomePage() {
  const snapshot = useMailboxes()
  // AIDEV-NOTE: Only a completed mailbox traversal establishes zero visible mailboxes.
  if (snapshot.status === 'loading') {
    return <div role="status" aria-label="Loading mailbox selection"><Skeleton rows={4} /></div>
  }
  if (snapshot.status === 'error') {
    return <EmptyState title="Mailboxes could not be loaded" body="Use Try again in the navigation menu, or reload the page." />
  }
  if (snapshot.mailboxes.length === 0) {
    return (
      <EmptyState
        title="No visible mailboxes"
        body="If you expected a mailbox here, ask your organization administrator to check your access."
      />
    )
  }
  return <Today mailboxes={snapshot.mailboxes} />
}
