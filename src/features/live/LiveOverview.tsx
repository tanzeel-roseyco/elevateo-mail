import { useCallback, useEffect, useRef, useState } from 'react'
import { createHealthGateway, type HealthSnapshot } from '@/data/http/healthGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import { SERVER_SEND_STATUSES, sendStatusView } from '@/domain/sendLifecycle'
import { usePageTitle } from '@/ui/Bits'
import { Button } from '@/ui/Button'

const health = createHealthGateway(http)
const REFRESH_INTERVAL = 30_000

export function LiveOverview() {
  usePageTitle('Overview')
  const accountId = useLive(state => state.accountId)
  return accountId ? <OverviewPanel key={accountId} accountId={accountId} /> : null
}

// AIDEV-NOTE: Account-keyed state is ephemeral; no polling loop or background requests drain idle clients.
function OverviewPanel({ accountId }: { accountId: string }) {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const active = useRef(false)
  const busy = useRef(false)
  const lastAttempt = useRef<number | null>(null)
  const refresh = useCallback(async () => {
    if (!active.current || busy.current || document.visibilityState !== 'visible') return
    busy.current = true
    lastAttempt.current = Date.now()
    setLoading(true)
    setError(false)
    setSnapshot(null)
    const current = () => active.current && live.store.getState().accountId === accountId
    try {
      const result = await health.read()
      if (current()) { setSnapshot(result); setUpdatedAt(Date.now()) }
    } catch (cause) {
      if (current()) {
        setError(true)
        if (cause instanceof ApiFailure && cause.kind === 'unauthorized') void live.recheckSession()
      }
    } finally {
      busy.current = false
      if (current()) setLoading(false)
    }
  }, [accountId])
  useEffect(() => {
    active.current = true
    void refresh()
    const visible = () => {
      if (lastAttempt.current === null || Date.now() - lastAttempt.current >= REFRESH_INTERVAL) void refresh()
    }
    document.addEventListener('visibilitychange', visible)
    return () => { active.current = false; document.removeEventListener('visibilitychange', visible) }
  }, [refresh])
  return <main className="h-full overflow-auto p-4 md:p-6">
    <div className="flex items-center justify-between gap-4"><h1 className="text-xl font-semibold">Overview</h1>
      <Button onClick={() => void refresh()} disabled={loading}>Refresh</Button></div>
    <p className="mt-2 text-sm text-muted">Your server's saved send requests across all dates. These counts do not measure delivery or opens.</p>
    {loading && <p role="status" className="mt-5">Loading account health…</p>}
    {error && <p role="alert" className="mt-5 text-danger">Account health could not be loaded. Use Refresh to try again.</p>}
    {snapshot && <>
      <section aria-label="Server status" className="my-5 rounded-xl border border-line bg-surface p-4 text-sm">
        <p className="font-semibold">{snapshot.simulated ? 'Simulation — no real email delivery' : snapshot.liveSending ? 'Live sending enabled — mailbox permissions still apply' : 'Live sending disabled'}</p>
        <p>Dispatch: {snapshot.dispatchPaused ? 'Paused' : 'Enabled'}</p>
        <p>Live sending: {snapshot.liveSending ? 'Enabled' : 'Disabled'}</p>
        <p>DNS changes: {snapshot.dnsWrites ? 'Enabled' : 'Disabled'}</p>
        <p>Production integration: {snapshot.integrationReady ? 'Ready' : 'Not ready'}</p>
        {snapshot.backgroundJobs?.map(job => <p key={job.name}>
          {{ dispatch: 'Send scheduling', inbox: 'Inbox scheduling', cleanup: 'Expired sign-in cleanup' }[job.name]}: {
            { not_started: 'Not started', failed: 'Needs attention', late: 'No recent check-in', running: 'Running', healthy: 'Recent check-in' }[job.status]}
        </p>)}
      </section>
      {snapshot.incompleteMessages > 0 && <p role="alert" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
        {snapshot.incompleteMessages.toLocaleString()} messages could not be fully imported. Some saved content may be out of date. Open the original mailbox to read those messages.
      </p>}
      {snapshot.sends.length === 0 && <p className="mb-4 text-sm text-muted">No send requests have been saved yet.</p>}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{SERVER_SEND_STATUSES.map(status => {
        const view = sendStatusView(status)
        return <div key={status} className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-sm font-medium">{view.label}</dt>
          <dd className="my-2 text-2xl font-semibold tabular-nums">{(snapshot.sends.find(row => row.status === status)?.count ?? 0).toLocaleString()}</dd>
          <dd className="text-xs text-muted">{view.meaning}</dd>
        </div>
      })}</dl>
      {updatedAt !== null && <p className="mt-4 text-xs text-muted">Last checked {new Date(updatedAt).toLocaleTimeString()}. Refresh for current counts.</p>}
    </>}
  </main>
}
