import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, ChevronLeft, ChevronRight, Clock, HelpCircle, Hourglass, Loader, Pencil, RefreshCw, Send, ShieldCheck, Trash2, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { SendSummary } from '@/data/http/contract'
import { live, useLive } from '@/data/http/instance'
import { REQUEST_PAGE_LIMIT, type PendingSubmission } from '@/data/http/live'
import { canApprove, canCancel, canReplace, isSettled, recipientCount, sendStatusView, UNCONFIRMED_VIEW, type SendStatus } from '@/domain/sendLifecycle'
import { cx, formatDateTime, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Callout, EmptyState, Skeleton, usePageTitle } from '@/ui/Bits'
import { Button, buttonClass, IconButton } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { toast } from '@/ui/toast'
import { usePagePosition } from './paging'
import { QuotaLine } from './QuotaLine'
import { SendPreview } from './SendPreview'

// Every status carries an icon and words, so its meaning never depends on colour.
const ICONS: Record<SendStatus, LucideIcon> = { draft: ShieldCheck, pending: Hourglass, dispatching: Loader, accepted: CheckCircle2, rejected: XCircle, cancelled: Ban, unknown: AlertTriangle }

export function SendStatusBadge({ status }: { status: SendStatus }) {
  const view = sendStatusView(status)
  return (
    <Badge tone={view.tone} icon={ICONS[status]}>
      {view.label}
    </Badge>
  )
}

const failed = (error: unknown): void => void toast(error instanceof Error ? error.message : 'That did not work. Nothing was changed.', { tone: 'error' })

/**
 * Keeps one request current while its page is open and visible: its content and state are read on arrival, then the
 * bounded checks owned by the store run. Checking stops when the page closes or the tab is hidden.
 */
function useTracking(id: string): void {
  useEffect(() => {
    let stop: (() => void) | null = null
    let arrived = false
    const begin = () => {
      if (stop || document.visibilityState !== 'visible') return
      if (!arrived) void live.openRequest(id)
      // Coming back to the tab re-reads the state, except an unknown outcome: that is checked only on request.
      else if (live.store.getState().details.find((d) => d.id === id)?.status !== 'unknown') void live.refresh(id).catch(() => undefined)
      arrived = true
      stop = live.watch(id)
    }
    const end = () => {
      stop?.()
      stop = null
    }
    const onVisibility = () => (document.visibilityState === 'visible' ? begin() : end())
    begin()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      end()
    }
  }, [id])
}

function Detail({ id, backHref, backState }: { id: string; backHref: string; backState: unknown }) {
  const navigate = useNavigate()
  const detail = useLive((s) => s.details.find((d) => d.id === id))
  const stalled = useLive((s) => s.stalled.includes(id))
  const simulated = useLive((s) => s.capabilities?.simulated ?? false)
  const [busy, setBusy] = useState<null | 'approve' | 'cancel' | 'check'>(null)
  useTracking(id)

  const run = (kind: NonNullable<typeof busy>, action: () => Promise<unknown>) => {
    setBusy(kind)
    void action()
      .catch(failed)
      .finally(() => setBusy(null))
  }
  const cancel = async () => {
    if (!(await confirm({ title: 'Cancel this request?', body: 'The server will discard it if it has not been handed to the provider yet. This cannot be undone.', confirmLabel: 'Cancel request', danger: true }))) return
    run('cancel', () => live.cancel(id))
  }

  const saved = detail?.saved
  const status = detail?.status ?? null
  const view = status ? sendStatusView(status) : null
  const title = saved?.status === 'ready' ? saved.data.subject : 'Send request'
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Link to={backHref} state={backState} aria-label="Back to send requests" title="Back to send requests" className="inline-flex size-8 items-center justify-center rounded-full hover:bg-surface-2 lg:hidden">
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
      </div>
      {(!saved || saved.status === 'loading' || saved.status === 'idle') && <Skeleton rows={6} />}
      {saved?.status === 'error' && (
        <div role="alert">
          <EmptyState icon={AlertTriangle} title="This request could not be loaded" body={saved.message} action={<Button variant="primary" onClick={() => void live.openRequest(id)}>Try again</Button>} />
        </div>
      )}
      {saved?.status === 'ready' && detail && status && view && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex max-w-3xl flex-col gap-4 p-4 md:p-6">
            <section aria-label="Status" aria-live="polite" className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <SendStatusBadge status={status} />
                {status === 'accepted' && simulated && <Badge tone="neutral">Simulated provider · no real email</Badge>}
              </div>
              <p className="text-sm">{view.meaning}</p>
              {detail.errorCode && (status === 'rejected' || status === 'unknown') && <p className="text-[13px] text-muted">Server reason: {detail.errorCode.replaceAll('_', ' ')}.</p>}
              {detail.correlationId && (
                <p className="text-[13px] text-muted">
                  Reference for support: <span className="break-all font-mono text-xs">{detail.correlationId}</span>
                </p>
              )}
              {detail.checkedAt && <p className="text-xs text-muted">Status read from the server at {formatDateTime(detail.checkedAt)}.</p>}
              {stalled && <p className="text-[13px] text-muted">Automatic checking has stopped after several minutes. Use Check status to look again.</p>}
            </section>

            {detail.successorId && (
              <Callout tone="info" icon={Pencil}>
                This request was replaced by a new version, which needs its own approval.{' '}
                <Link to={`/sends/${detail.successorId}`} className="font-medium underline underline-offset-2">
                  Open the replacement
                </Link>
              </Callout>
            )}
            {detail.notice && (
              <Callout tone="warn" icon={AlertTriangle}>
                {detail.notice}
              </Callout>
            )}

            <SendPreview content={saved.data} from={saved.data.from} />

            {!isSettled(status) && (
              <p className="text-[13px] text-muted">
                {recipientCount(saved.data)} recipient{recipientCount(saved.data) === 1 ? '' : 's'}. <QuotaLine mailboxId={saved.data.summary.mailboxId} />
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {canApprove(status) && (
                <Button variant="primary" disabled={busy !== null} onClick={() => run('approve', () => live.approve(id))} icon={<ShieldCheck aria-hidden className="size-4" />}>
                  {busy === 'approve' ? 'Approving…' : 'Approve this version'}
                </Button>
              )}
              {!isSettled(status) && (
                <Button disabled={busy !== null} onClick={() => run('check', () => live.refresh(id))} icon={<RefreshCw aria-hidden className="size-4" />}>
                  {busy === 'check' ? 'Checking…' : 'Check status'}
                </Button>
              )}
              {canReplace(status) && !detail.successorId && saved.data.kind === 'manual' && (
                <Button disabled={busy !== null} onClick={() => void navigate(`/compose?replace=${id}`)} icon={<Pencil aria-hidden className="size-4" />}>
                  Edit as a replacement
                </Button>
              )}
              {canCancel(status) && (
                <Button variant="ghost" disabled={busy !== null} onClick={() => void cancel()} icon={<Ban aria-hidden className="size-4" />}>
                  {busy === 'cancel' ? 'Cancelling…' : 'Cancel request'}
                </Button>
              )}
            </div>
            {canApprove(status) && <p className="text-xs text-muted">Approving holds capacity and queues this exact version. The server may still refuse it, for example when the mailbox has no capacity left.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Submissions that have a stored key but no answer yet. Each is resolved against the server, never re-created. */
function PendingPanel({ pending }: { pending: PendingSubmission[] }) {
  const navigate = useNavigate()
  if (pending.length === 0) return null
  const check = (key: string) => void live.resolvePending(key).then((id) => id && void navigate(`/sends/${id}`), failed)
  return (
    <section aria-label="Unconfirmed submissions" className="shrink-0 border-b border-line bg-warn/10">
      <ul>
        {pending.map((p) => (
          <li key={p.key} className="flex flex-col gap-1.5 border-b border-line/60 px-4 py-2.5 last:border-b-0">
            <span className="flex items-center gap-2">
              <Badge tone="warn" icon={HelpCircle}>
                {p.state === 'missing' ? 'Not saved' : UNCONFIRMED_VIEW.label}
              </Badge>
              <time dateTime={new Date(p.startedAt).toISOString()} className="text-xs tabular-nums text-muted">
                Submitted {formatWhen(new Date(p.startedAt).toISOString())}
              </time>
            </span>
            <p className="text-[13px]">{p.state === 'missing' ? 'The server does not hold this request. It was not saved and nothing was sent. Compose it again if it is still needed.' : (p.notice ?? UNCONFIRMED_VIEW.meaning)}</p>
            <span>
              {p.state === 'missing' ? (
                <Button size="sm" onClick={() => live.dismissPending(p.key)} icon={<Trash2 aria-hidden className="size-3.5" />}>
                  Dismiss
                </Button>
              ) : (
                <Button size="sm" disabled={p.state === 'checking'} onClick={() => check(p.key)} icon={<RefreshCw aria-hidden className="size-3.5" />}>
                  {p.state === 'checking' ? 'Checking…' : 'Check again'}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Records the earlier version of this app left in the browser and the server does not hold for this account. */
function LegacyPanel({ count }: { count: number }) {
  if (count === 0) return null
  const discard = async () => {
    if (!(await confirm({ title: 'Discard these stored items?', body: 'They exist only in this browser and will be gone. Requests the server holds are not affected.', confirmLabel: 'Discard', danger: true }))) return
    live.discardLegacy()
  }
  return (
    <section aria-label="Items from an earlier version" className="shrink-0 border-b border-line px-4 py-2.5 text-[13px]">
      <p>
        <span className="font-semibold">
          {count} item{count === 1 ? '' : 's'} from an earlier version of this app {count === 1 ? 'is' : 'are'} still stored in this browser.
        </span>{' '}
        The server does not hold {count === 1 ? 'it' : 'them'} for this account, so nothing here was sent from it. The text is not shown, because this browser cannot tell which account wrote it.
      </p>
      <Button size="sm" className="mt-1.5" onClick={() => void discard()} icon={<Trash2 aria-hidden className="size-3.5" />}>
        Discard {count === 1 ? 'it' : 'them'}
      </Button>
    </section>
  )
}

function Row({ item, href, state, active, mailbox }: { item: SendSummary; href: string; state: unknown; active: boolean; mailbox: string }) {
  return (
    <li className={cx('border-b border-line', active ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
      <Link to={href} state={state} aria-current={active ? 'true' : undefined} className="flex flex-col gap-1 px-4 py-2.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">From {mailbox}</span>
          <time dateTime={item.createdAt} className="shrink-0 text-xs tabular-nums text-muted">
            {formatWhen(item.createdAt)}
          </time>
        </span>
        <span className="flex items-center gap-2">
          <SendStatusBadge status={item.status} />
          {item.successorId && <span className="text-[13px] text-muted">Replaced</span>}
        </span>
      </Link>
    </li>
  )
}

// AIDEV-NOTE: The account's send requests as the server lists them, one page at a time. Rows carry no subject or
// recipients (the list has none); the exact saved content is read from the server when a request is opened.
export function SendsPage() {
  usePageTitle('Send requests')
  const { id } = useParams()
  const requests = useLive((s) => s.requests)
  const pending = useLive((s) => s.pending)
  const legacy = useLive((s) => s.legacy.length)
  const mailboxes = useLive((s) => s.mailboxes)
  const position = usePagePosition()
  const before = position.cursor?.before
  const beforeId = position.cursor?.beforeId
  useEffect(() => {
    void live.openRequests(before !== undefined && beforeId !== undefined ? { before, beforeId } : null)
  }, [before, beforeId])

  const onPage = requests && (requests.cursor?.beforeId ?? null) === (beforeId ?? null) && (requests.cursor?.before ?? null) === (before ?? null)
  const page = onPage ? requests.page : null
  const next = page?.status === 'ready' ? page.data.next : null
  const address = (mailboxId: string): string => mailboxes.find((m) => m.id === mailboxId)?.address ?? 'a mailbox no longer listed'

  return (
    <div className="flex h-full min-h-0">
      <section aria-label="Send requests" className={cx('flex min-h-0 w-full flex-col lg:w-[380px] lg:shrink-0 lg:border-r lg:border-line', id && 'hidden lg:flex')}>
        <div className="flex shrink-0 items-center gap-2 border-b border-line p-3">
          <h1 className="text-lg font-semibold tracking-tight">Send requests</h1>
          <IconButton label="Refresh send requests" className="ml-auto" onClick={() => void live.reloadRequests()}>
            <RefreshCw aria-hidden className="size-4" />
          </IconButton>
          <Link to="/compose" className={buttonClass('primary', 'sm')}>
            <Send aria-hidden className="size-3.5" />
            Compose
          </Link>
        </div>
        <PendingPanel pending={pending} />
        <LegacyPanel count={legacy} />
        {(!page || page.status === 'loading' || page.status === 'idle') && <Skeleton rows={8} />}
        {page?.status === 'error' && (
          <div role="alert">
            <EmptyState icon={AlertTriangle} title="Send requests could not be loaded" body={page.message} action={<Button variant="primary" onClick={() => void live.reloadRequests()}>Try again</Button>} />
          </div>
        )}
        {page?.status === 'ready' &&
          (page.data.items.length === 0 ? (
            <EmptyState icon={Clock} title={position.cursor ? 'No older requests' : 'No send requests'} body={position.cursor ? 'You have reached the end of the list.' : 'Messages you submit appear here with their state: awaiting approval, queued, and the final outcome.'} />
          ) : (
            <ul aria-label="Saved send requests" className="min-h-0 flex-1 overflow-y-auto">
              {page.data.items.map((item) => (
                <Row key={item.id} item={item} href={`/sends/${item.id}${position.search}`} state={position.state} active={item.id === id} mailbox={address(item.mailboxId)} />
              ))}
            </ul>
          ))}
        <div className="mt-auto flex shrink-0 items-center justify-end gap-2 border-t border-line px-3 py-1.5 text-[13px] text-muted">
          <span aria-live="polite">
            {position.pageNumber ? `Page ${position.pageNumber}` : 'Older requests'} · up to {REQUEST_PAGE_LIMIT} per page
          </span>
          <IconButton label={position.pageNumber ? 'Newer requests' : 'Newest requests'} disabled={!position.cursor} onClick={() => position.newer('/sends')}>
            <ChevronLeft aria-hidden className="size-4" />
          </IconButton>
          <IconButton label="Older requests" disabled={!next} onClick={() => next && position.older('/sends', next)}>
            <ChevronRight aria-hidden className="size-4" />
          </IconButton>
        </div>
        <p className="shrink-0 border-t border-line px-4 py-2 text-xs text-muted">Listed by the server, newest first. Subject and recipients are read from the server when a request is opened; they are not kept in this browser.</p>
      </section>
      <section aria-label="Request" className={cx('min-h-0 min-w-0 flex-1', !id && 'hidden lg:block')}>
        {id ? <Detail key={id} id={id} backHref={`/sends${position.search}`} backState={position.state} /> : <EmptyState icon={Send} title="No request open" body="Choose a request to see its exact content and status." />}
      </section>
    </div>
  )
}
