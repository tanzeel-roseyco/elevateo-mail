// Organization-wide suppression list (FC web-delivery). Shows each suppressed address, why it is
// suppressed, since when, and the originating send. Search lives in the URL. Suppression blocks
// future sends to the address; removal is server/admin-managed, so this page never offers it. The
// data port is optional: without it the page shows an honest unavailable state, and the demo/fixture
// adapter's rows are labelled simulated.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useFeatureGateways } from '@/app/featureGateways'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useSession } from '@/app/session'
import type { SuppressionQuery, SuppressionReason, SuppressionRecord } from '@/data/deliveryReportsContract'
import { canonicalId } from '@/lib/ids'
import { formatDateTime } from '@/lib/format'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Button, buttonClass } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Field, TextInput } from '@/ui/Field'
import { ShieldCheckIcon } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'
import { UnavailableSetting } from '@/features/settings/UnavailableSetting'

const REASON_LABELS: Record<SuppressionReason, string> = {
  hard_bounce: 'Hard bounce', complaint: 'Spam complaint', manual: 'Added manually', unsubscribe: 'Unsubscribed',
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  // pageError: a failed "Show more" keeps the rows already shown and offers a retry instead.
  | { kind: 'ready'; items: SuppressionRecord[]; nextCursor: string | null; loadingMore: boolean; pageError: boolean }

export function SuppressionsPage() {
  const { mailboxId } = useParams()
  const [params, setParams] = useSearchParams()
  const { state: session } = useSession()
  const q = params.get('q') ?? ''
  if (!mailboxId || !canonicalId(mailboxId)) {
    return <><PageHeader title="Suppressions" /><EmptyState icon={<ShieldCheckIcon className="size-5" />} title="Invalid mailbox link" body="Open suppressions from a mailbox." action={<Link to="/inbox" className={buttonClass('primary', 'md')}>Open inbox</Link>} /></>
  }
  const organizationId = session.status === 'ready' ? session.session.organization.id : null
  const submit = (value: string) => {
    const next = new URLSearchParams(params)
    const trimmed = value.trim()
    if (trimmed === '') next.delete('q')
    else next.set('q', trimmed)
    setParams(next, { replace: true })
  }
  return (
    <>
      <PageHeader title="Suppressions" subtitle="Addresses blocked from further sends across this organization" />
      <Callout variant="neutral" role="note" className="mb-6 max-w-3xl">
        A suppressed address is blocked from every future send until an administrator removes it on the server. Suppressions are added automatically after a hard bounce or a spam complaint, or manually by an administrator.
      </Callout>
      <form className="mb-6 flex max-w-md items-end gap-3" onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget).get('q') as string) }}>
        {/* AIDEV-NOTE: URL navigation must replace any unsent search draft with the active query. */}
        <Field id="suppression-search" label="Search address"><TextInput key={q} id="suppression-search" name="q" type="search" defaultValue={q} placeholder="name@example.com" autoComplete="off" /></Field>
        <Button type="submit" variant="primary">Search</Button>
      </form>
      {organizationId === null ? (
        <EmptyState icon={<ShieldCheckIcon className="size-5" />} title="Sign in to view suppressions" body="Suppressions are scoped to your organization." />
      ) : (
        // Keyed so a new search resets list state and aborts the superseded request.
        <SuppressionList key={`${organizationId}\n${q}`} organizationId={organizationId} q={q} />
      )}
    </>
  )
}

function SuppressionList({ organizationId, q }: { organizationId: string; q: string }) {
  const port = useFeatureGateways().deliveryReports
  const { request } = useProtectedRequest()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const heading = useRef<HTMLHeadingElement>(null)

  const load = useCallback(async (cursor: string | undefined, append: boolean) => {
    if (!port) return
    if (append) setState((prev) => (prev.kind === 'ready' ? { ...prev, loadingMore: true, pageError: false } : prev))
    else setState({ kind: 'loading' })
    const query: SuppressionQuery = { ...(q === '' ? {} : { q }), ...(cursor === undefined ? {} : { cursor }) }
    const outcome = await request((ctx, signal) => port.listSuppressions(ctx, organizationId, query, signal))
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed' || outcome.value.organization_id !== organizationId) {
      setState((prev) => (append && prev.kind === 'ready' ? { ...prev, loadingMore: false, pageError: true } : { kind: 'error' }))
      return
    }
    setState((prev) => {
      const existing = append && prev.kind === 'ready' ? prev.items : []
      const seen = new Set(existing.map((item) => item.id))
      return { kind: 'ready', items: [...existing, ...outcome.value.items.filter((item) => !seen.has(item.id))], nextCursor: outcome.value.next_cursor, loadingMore: false, pageError: false }
    })
  }, [port, request, organizationId, q])

  useEffect(() => { void load(undefined, false) }, [load])
  useEffect(() => { if (state.kind === 'ready') heading.current?.focus() }, [state.kind])

  if (!port) {
    return <UnavailableSetting icon={<ShieldCheckIcon className="size-5" />} title="Suppressions are not available yet" body="This workspace is not connected to the provider's suppression list. Suppressed addresses will appear here once the server exposes them." />
  }
  if (state.kind === 'loading') return <div role="status" aria-label="Loading suppressions"><Skeleton rows={4} /></div>
  if (state.kind === 'error') return <ErrorState title="Suppressions could not be loaded" body="The list is unavailable right now." action={<Button variant="primary" onClick={() => void load(undefined, false)}>Try again</Button>} />
  return (
    <section aria-label="Suppressions" className="max-w-3xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 ref={heading} tabIndex={-1} className="text-base font-medium text-zinc-800 dark:text-white">{state.items.length === 0 ? 'No suppressed addresses' : `${state.items.length} shown`}</h2>
        {port.simulated && <Badge tone="warn" size="sm">Simulated</Badge>}
      </div>
      {state.items.length === 0 ? (
        <EmptyState icon={<ShieldCheckIcon className="size-5" />} title={q === '' ? 'No suppressed addresses' : 'No match'} body={q === '' ? 'No address is suppressed in this organization.' : 'No suppressed address contains that text.'} />
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
          {state.items.map((record) => (
            <li key={record.id} className="space-y-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="danger" size="sm">{REASON_LABELS[record.reason]}</Badge>
                <span className="min-w-0 break-all font-medium text-zinc-800 dark:text-white">{record.address}</span>
                <time dateTime={record.since} className="ms-auto text-xs text-zinc-500">Since {formatDateTime(record.since)}</time>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Blocked from further sends.{record.removable ? '' : ' Removal is managed on the server.'}</p>
              {/* Org-scoped list: the source send's mailbox is unknown here, so the id is shown as text, not a link. */}
              {record.source_send_id !== null && <p className="text-xs text-zinc-500">Source send <span className="break-all font-mono">{record.source_send_id}</span></p>}
            </li>
          ))}
        </ul>
      )}
      {state.pageError && <Callout variant="danger" role="alert">More suppressed addresses could not be loaded. The rows above are still current; use Show more to try again.</Callout>}
      {state.nextCursor !== null && (
        <div className="flex justify-center">
          <Button size="sm" disabled={state.loadingMore} onClick={() => void load(state.nextCursor ?? undefined, true)}>{state.loadingMore ? 'Loading…' : 'Show more'}</Button>
        </div>
      )}
    </section>
  )
}
