import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, CircleDashed, Clock, FileText, HelpCircle, Hourglass, Loader, Pencil, RefreshCw, Send, ShieldCheck, Trash2, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { live, useLive } from '@/data/http/instance'
import { canApprove, canCancel, isSettled, recipientCount, sendStatusView, type SendRecord, type SendStatus } from '@/domain/sendLifecycle'
import { cx, formatDateTime, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Callout, EmptyState, usePageTitle } from '@/ui/Bits'
import { Button, buttonClass } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { toast } from '@/ui/toast'
import { QuotaLine } from './QuotaLine'
import { SendPreview } from './SendPreview'

// Every status carries an icon and words, so its meaning never depends on colour.
const ICONS: Record<SendStatus, LucideIcon> = { local_draft: FileText, unconfirmed: HelpCircle, draft: ShieldCheck, pending: Hourglass, dispatching: Loader, accepted: CheckCircle2, rejected: XCircle, cancelled: Ban, unknown: AlertTriangle }

export function SendStatusBadge({ status }: { status: SendStatus }) {
  const view = sendStatusView(status)
  return (
    <Badge tone={view.tone} icon={ICONS[status]}>
      {view.label}
    </Badge>
  )
}

/**
 * Keeps one request's status current while its page is open and visible: one read on arrival, then the bounded
 * checks owned by the store. Checking stops when the page closes or the tab is hidden.
 */
function useTracking(key: string | undefined): void {
  useEffect(() => {
    if (!key) return
    let stop: (() => void) | null = null
    const begin = () => {
      if (stop || document.visibilityState !== 'visible') return
      // An unknown outcome is never checked automatically; the person asks for a check with the button.
      if (live.store.getState().sends.find((r) => r.key === key)?.status !== 'unknown') void live.refresh(key).catch(() => undefined)
      stop = live.watch(key)
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
  }, [key])
}

function Detail({ record }: { record: SendRecord }) {
  const navigate = useNavigate()
  const mailbox = useLive((s) => s.mailboxes.find((m) => m.id === record.content.mailboxId))
  const stalled = useLive((s) => s.stalled.includes(record.key))
  const simulated = useLive((s) => s.capabilities?.simulated ?? false)
  const [busy, setBusy] = useState<null | 'approve' | 'cancel' | 'check' | 'edit'>(null)
  const view = sendStatusView(record.status)
  useTracking(record.key)

  const run = (kind: NonNullable<typeof busy>, action: () => Promise<unknown>) => {
    setBusy(kind)
    void action()
      .catch((error: unknown) => toast(error instanceof Error ? error.message : 'That did not work. Nothing was changed.', { tone: 'error' }))
      .finally(() => setBusy(null))
  }
  const approve = () => run('approve', () => live.approve(record.key))
  const check = () => run('check', () => live.refresh(record.key))
  const cancel = async () => {
    if (!(await confirm({ title: 'Cancel this request?', body: 'The server will discard it if it has not been handed to the provider yet. This cannot be undone.', confirmLabel: 'Cancel request', danger: true }))) return
    run('cancel', () => live.cancel(record.key))
  }
  const edit = async () => {
    if (record.status === 'local_draft') return void navigate(`/compose?draft=${record.key}`)
    if (!(await confirm({ title: 'Cancel and edit a copy?', body: 'A submitted version cannot be changed. This cancels it on the server and opens a copy as a new draft, which will need its own approval.', confirmLabel: 'Cancel and edit', danger: true }))) return
    run('edit', async () => navigate(`/compose?draft=${await live.editAsNew(record.key)}`))
  }
  const remove = async () => {
    const local = record.status === 'local_draft'
    if (!(await confirm({ title: local ? 'Delete this draft?' : 'Remove from this list?', body: local ? 'The draft exists only in this browser and will be gone.' : 'This only removes it from this browser. The server keeps its record.', confirmLabel: local ? 'Delete draft' : 'Remove', danger: true }))) return
    live.forget(record.key)
    void navigate('/sends')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Link to="/sends" aria-label="Back to send requests" title="Back to send requests" className="inline-flex size-8 items-center justify-center rounded-full hover:bg-surface-2 lg:hidden">
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{record.content.subject || '(no subject)'}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-3xl flex-col gap-4 p-4 md:p-6">
          <section aria-label="Status" aria-live="polite" className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <SendStatusBadge status={record.status} />
              {record.status === 'accepted' && simulated && <Badge tone="neutral">Simulated provider · no real email</Badge>}
            </div>
            <p className="text-sm">{view.meaning}</p>
            {record.errorCode && (record.status === 'rejected' || record.status === 'unknown') && <p className="text-[13px] text-muted">Server reason: {record.errorCode.replaceAll('_', ' ')}.</p>}
            {record.correlationId && (
              <p className="text-[13px] text-muted">
                Reference for support: <span className="break-all font-mono text-xs">{record.correlationId}</span>
              </p>
            )}
            {record.checkedAt && <p className="text-xs text-muted">Status read from the server at {formatDateTime(record.checkedAt)}.</p>}
            {stalled && <p className="text-[13px] text-muted">Automatic checking has stopped after several minutes. Use Check status to look again.</p>}
          </section>

          {record.notice && (
            <Callout tone="warn" icon={AlertTriangle}>
              {record.notice}
            </Callout>
          )}

          <SendPreview content={record.content} from={mailbox?.address ?? 'a mailbox no longer listed'} />

          {!isSettled(record.status) && record.status !== 'local_draft' && (
            <p className="text-[13px] text-muted">
              {recipientCount(record.content)} recipient{recipientCount(record.content) === 1 ? '' : 's'}. <QuotaLine mailboxId={record.content.mailboxId} />
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {canApprove(record.status) && (
              <Button variant="primary" disabled={busy !== null} onClick={approve} icon={<ShieldCheck aria-hidden className="size-4" />}>
                {busy === 'approve' ? 'Approving…' : 'Approve this version'}
              </Button>
            )}
            {record.status === 'local_draft' && (
              <Button variant="primary" onClick={() => void edit()} icon={<Pencil aria-hidden className="size-4" />}>
                Continue editing
              </Button>
            )}
            {record.status !== 'local_draft' && !isSettled(record.status) && (
              <Button disabled={busy !== null} onClick={check} icon={<RefreshCw aria-hidden className="size-4" />}>
                {busy === 'check' ? 'Checking…' : record.status === 'unconfirmed' ? 'Check again' : 'Check status'}
              </Button>
            )}
            {canCancel(record.status) && (
              <>
                <Button disabled={busy !== null} onClick={() => void edit()} icon={<Pencil aria-hidden className="size-4" />}>
                  {busy === 'edit' ? 'Cancelling…' : 'Cancel and edit'}
                </Button>
                <Button variant="ghost" disabled={busy !== null} onClick={() => void cancel()} icon={<Ban aria-hidden className="size-4" />}>
                  {busy === 'cancel' ? 'Cancelling…' : 'Cancel request'}
                </Button>
              </>
            )}
            {(isSettled(record.status) || record.status === 'local_draft') && (
              <Button variant="ghost" onClick={() => void remove()} icon={<Trash2 aria-hidden className="size-4" />}>
                {record.status === 'local_draft' ? 'Delete draft' : 'Remove from list'}
              </Button>
            )}
          </div>
          {canApprove(record.status) && <p className="text-xs text-muted">Approving holds capacity and queues this exact version. The server may still refuse it, for example when the mailbox has no capacity left.</p>}
        </div>
      </div>
    </div>
  )
}

function Row({ record, active }: { record: SendRecord; active: boolean }) {
  return (
    <li className={cx('border-b border-line', active ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
      <Link to={`/sends/${record.key}`} aria-current={active ? 'true' : undefined} className="flex flex-col gap-1 px-4 py-2.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{record.content.subject || '(no subject)'}</span>
          <time dateTime={record.createdAt} className="shrink-0 text-xs tabular-nums text-muted">
            {formatWhen(record.createdAt)}
          </time>
        </span>
        <span className="flex items-center gap-2">
          <SendStatusBadge status={record.status} />
          <span className="min-w-0 truncate text-[13px] text-muted">To {record.content.to[0] ?? 'nobody yet'}</span>
        </span>
      </Link>
    </li>
  )
}

// AIDEV-NOTE: Send requests made from this browser, each tracked against the server. The server has no list of them
// yet, so a request made on another device does not appear here; that limit is stated on the page.
export function SendsPage() {
  usePageTitle('Send requests')
  const { key } = useParams()
  const sends = useLive((s) => s.sends)
  const ordered = [...sends].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const open = sends.find((r) => r.key === key)

  return (
    <div className="flex h-full min-h-0">
      <section aria-label="Send requests" className={cx('flex min-h-0 w-full flex-col lg:w-[380px] lg:shrink-0 lg:border-r lg:border-line', key && 'hidden lg:flex')}>
        <div className="flex shrink-0 items-center gap-2 border-b border-line p-3">
          <h1 className="text-lg font-semibold tracking-tight">Send requests</h1>
          <Link to="/compose" className={cx(buttonClass('primary', 'sm'), 'ml-auto')}>
            <Send aria-hidden className="size-3.5" />
            Compose
          </Link>
        </div>
        {ordered.length === 0 ? (
          <EmptyState icon={Clock} title="No send requests" body="Messages you compose appear here with their status: draft, awaiting approval, queued, and the final outcome." />
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {ordered.map((r) => (
              <Row key={r.key} record={r} active={r.key === key} />
            ))}
          </ul>
        )}
        <p className="shrink-0 border-t border-line px-4 py-2 text-xs text-muted">Shows requests made in this browser. The server cannot list them yet, so requests made elsewhere are not shown.</p>
      </section>
      <section aria-label="Request" className={cx('min-h-0 min-w-0 flex-1', !key && 'hidden lg:block')}>
        {open ? (
          <Detail key={open.key} record={open} />
        ) : key ? (
          <EmptyState icon={CircleDashed} title="Request not found in this browser" body="This browser has no record of that request. It may have been made in another browser, or removed from this list." action={<Link to="/sends" className={buttonClass('primary')}>All send requests</Link>} />
        ) : (
          <EmptyState icon={Send} title="No request open" body="Choose a request to see its exact content and status." />
        )}
      </section>
    </div>
  )
}
