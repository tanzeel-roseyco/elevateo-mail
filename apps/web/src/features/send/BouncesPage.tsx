// Mailbox-scoped bounce and complaint list (FC web-delivery). Rows carry the recipient, bounce type
// (hard/soft) or complaint, the provider's plain-text reason, the time, and links to the send status
// and originating thread. Type and time-window filters live in the URL. The data port is optional:
// when the server does not expose it the page shows an honest unavailable state, and the demo/fixture
// adapter's rows are labelled simulated.
//
// AIDEV-NOTE: Bounce reasons are provider free text — rendered as text only, never as HTML.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useFeatureGateways } from '@/app/featureGateways'
import { useProtectedRequest } from '@/app/protectedRequest'
import type { BounceQuery, BounceRecord } from '@/data/deliveryReportsContract'
import { canonicalId } from '@/lib/ids'
import { formatDateTime } from '@/lib/format'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Button, buttonClass } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Field, Select } from '@/ui/Field'
import { ArrowUturnLeftIcon } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'
import { linkClass } from '@/ui/Text'
import { UnavailableSetting } from '@/features/settings/UnavailableSetting'
import { windowSinceIso, WINDOW_LABELS, parseWindow, type TimeWindow } from './deliveryFilters'

const TYPE_VALUES = ['all', 'hard', 'soft', 'complaint'] as const
type TypeFilter = (typeof TYPE_VALUES)[number]
const TYPE_LABELS: Record<TypeFilter, string> = { all: 'All bounces and complaints', hard: 'Hard bounces', soft: 'Soft bounces', complaint: 'Complaints' }

function parseType(value: string | null): TypeFilter {
  return (TYPE_VALUES as readonly string[]).includes(value ?? '') ? (value as TypeFilter) : 'all'
}

const TONE: Record<'hard' | 'soft' | 'complaint', 'danger' | 'warn'> = { hard: 'danger', soft: 'warn', complaint: 'warn' }
const KIND_LABEL: Record<'hard' | 'soft' | 'complaint', string> = { hard: 'Hard bounce', soft: 'Soft bounce', complaint: 'Complaint' }
function kindOf(record: BounceRecord): 'hard' | 'soft' | 'complaint' {
  return record.provider_event === 'complained' ? 'complaint' : record.bounce_type ?? 'hard'
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  // pageError: a failed "Show more" keeps the rows already shown and offers a retry instead.
  | { kind: 'ready'; items: BounceRecord[]; nextCursor: string | null; loadingMore: boolean; pageError: boolean }

export function BouncesPage() {
  const { mailboxId } = useParams()
  const [params, setParams] = useSearchParams()
  if (!mailboxId || !canonicalId(mailboxId)) {
    return <><PageHeader title="Bounces" /><EmptyState icon={<ArrowUturnLeftIcon className="size-5" />} title="Invalid mailbox link" body="Open bounces from a mailbox." action={<Link to="/inbox" className={buttonClass('primary', 'md')}>Open inbox</Link>} /></>
  }
  const type = parseType(params.get('type'))
  const window = parseWindow(params.get('window'))
  const setFilter = (key: 'type' | 'window', value: string) => {
    const next = new URLSearchParams(params)
    if ((key === 'type' && value === 'all') || (key === 'window' && value === 'all')) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
  return (
    <>
      <PageHeader title="Bounces" subtitle="Recipients the provider could not deliver to, and spam complaints" />
      <div className="mb-6 flex flex-wrap gap-4">
        <Field id="bounce-type" label="Type">
          <Select id="bounce-type" value={type} onChange={(event) => setFilter('type', event.target.value)}>
            {TYPE_VALUES.map((value) => <option key={value} value={value}>{TYPE_LABELS[value]}</option>)}
          </Select>
        </Field>
        <Field id="bounce-window" label="Time window">
          <Select id="bounce-window" value={window} onChange={(event) => setFilter('window', event.target.value)}>
            {(Object.keys(WINDOW_LABELS) as TimeWindow[]).map((value) => <option key={value} value={value}>{WINDOW_LABELS[value]}</option>)}
          </Select>
        </Field>
      </div>
      {/* Keyed so a filter change resets list state and aborts the superseded request. */}
      <BounceList key={`${mailboxId}\n${type}\n${window}`} mailboxId={mailboxId} type={type} window={window} />
    </>
  )
}

function BounceList({ mailboxId, type, window }: { mailboxId: string; type: TypeFilter; window: TimeWindow }) {
  const port = useFeatureGateways().deliveryReports
  const { request } = useProtectedRequest()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const heading = useRef<HTMLHeadingElement>(null)

  const load = useCallback(async (cursor: string | undefined, append: boolean) => {
    if (!port) return
    if (append) setState((prev) => (prev.kind === 'ready' ? { ...prev, loadingMore: true, pageError: false } : prev))
    else setState({ kind: 'loading' })
    const since = windowSinceIso(window)
    const query: BounceQuery = {
      ...(type === 'all' ? {} : { type }),
      ...(since === null ? {} : { since }),
      ...(cursor === undefined ? {} : { cursor }),
    }
    const outcome = await request((ctx, signal) => port.listBounces(ctx, mailboxId, query, signal))
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed' || outcome.value.mailbox_id !== mailboxId) {
      setState((prev) => (append && prev.kind === 'ready' ? { ...prev, loadingMore: false, pageError: true } : { kind: 'error' }))
      return
    }
    setState((prev) => {
      const existing = append && prev.kind === 'ready' ? prev.items : []
      const seen = new Set(existing.map((item) => item.id))
      return { kind: 'ready', items: [...existing, ...outcome.value.items.filter((item) => !seen.has(item.id))], nextCursor: outcome.value.next_cursor, loadingMore: false, pageError: false }
    })
  }, [port, request, mailboxId, type, window])

  useEffect(() => { void load(undefined, false) }, [load])
  useEffect(() => { if (state.kind === 'ready') heading.current?.focus() }, [state.kind])

  if (!port) {
    return <UnavailableSetting icon={<ArrowUturnLeftIcon className="size-5" />} title="Bounces are not available yet" body="This workspace is not connected to the provider's delivery reports. Bounces will appear here once the server exposes them." />
  }
  if (state.kind === 'loading') return <div role="status" aria-label="Loading bounces"><Skeleton rows={4} /></div>
  if (state.kind === 'error') return <ErrorState title="Bounces could not be loaded" body="The list is unavailable right now." action={<Button variant="primary" onClick={() => void load(undefined, false)}>Try again</Button>} />
  return (
    <section aria-label="Bounces" className="max-w-3xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 ref={heading} tabIndex={-1} className="text-base font-medium text-zinc-800 dark:text-white">{state.items.length === 0 ? 'No bounces' : `${state.items.length} shown`}</h2>
        {port.simulated && <Badge tone="warn" size="sm">Simulated</Badge>}
      </div>
      {state.items.length === 0 ? (
        <EmptyState icon={<ArrowUturnLeftIcon className="size-5" />} title="No bounces in this view" body="No recipient bounced or complained for the selected type and time window." />
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
          {state.items.map((record) => {
            const kind = kindOf(record)
            return (
              <li key={record.id} className="space-y-1 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[kind]} size="sm">{KIND_LABEL[kind]}</Badge>
                  <span className="min-w-0 break-all font-medium text-zinc-800 dark:text-white">{record.recipient}</span>
                  <time dateTime={record.occurred_at} className="ms-auto text-xs text-zinc-500">{formatDateTime(record.occurred_at)}</time>
                </div>
                {/* Plain text only: the reason never becomes markup. */}
                <p className="whitespace-pre-wrap break-words text-sm text-zinc-600 dark:text-zinc-300">{record.reason}</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Link to={`/mailboxes/${mailboxId}/send-intents/${record.send_id}`} className={linkClass}>View send status</Link>
                  {record.thread_id !== null && <Link to={`/mailboxes/${mailboxId}/threads/${record.thread_id}`} className={linkClass}>Open thread</Link>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {state.pageError && <Callout variant="danger" role="alert">More bounces could not be loaded. The rows above are still current; use Show more to try again.</Callout>}
      {state.nextCursor !== null && (
        <div className="flex justify-center">
          <Button size="sm" disabled={state.loadingMore} onClick={() => void load(state.nextCursor ?? undefined, true)}>{state.loadingMore ? 'Loading…' : 'Show more'}</Button>
        </div>
      )}
    </section>
  )
}
