import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Callout } from '@/ui/Callout'
import { FINDER_LABELS } from './FinderForms'
import type { FinderHealth, FinderJob, FinderResult } from './contract'

export function FinderHealthPanel({ health }: { health: FinderHealth | null }) {
  if (!health) return <p role="status" className="text-sm text-muted">Loading verification health…</p>
  return <Card className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-medium">Verification health</h2>
      <span className="text-sm">{health.remaining_daily_probes} / 50 daily probes remaining</span>
    </div>
    <p className="text-sm">Port 25: <strong>{health.smtp_available ? 'Available' : 'Unavailable'}</strong>. {health.smtp_reason}</p>
    <p className="text-sm text-muted wrap-anywhere">EHLO / reverse DNS: {health.ehlo_hostname ?? 'Not established'}</p>
    <p className="text-sm text-muted">One probe per mail host per minute; at most three candidates per person. Discovery continues when SMTP is unavailable.</p>
    {/* AIDEV-NOTE: Health polling refreshes this deadline; persisted expired pauses are historical. */}
    {health.halted_until && Date.parse(health.halted_until) > Date.now() && <Callout variant="danger" heading="SMTP probing paused" role="alert">
      A mail host reported a blocklist or reputation problem. All SMTP probes are paused until {new Date(health.halted_until).toLocaleString()}.
    </Callout>}
    {health.worker_seen_at === null && <Callout variant="warning">The discovery worker has not reported startup. Jobs remain queued.</Callout>}
  </Card>
}

// AIDEV-NOTE: Scraped content is rendered only as text; sources never create images or executable markup.
export function ResultView({ result }: { result: FinderResult }) {
  return <div className="space-y-2 text-sm wrap-anywhere">
    <p><strong>{result.email ?? 'No email returned'}</strong> · {result.status.replaceAll('_', ' ')} · {result.confidence}% confidence</p>
    {(result.name || result.title) && <p>{[result.name, result.title].filter(Boolean).join(' · ')}</p>}
    <ul className="list-disc space-y-1 ps-5 text-muted ">{result.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
    {result.sources.length > 0 && <details><summary className="cursor-pointer">Public sources ({result.sources.length})</summary>
      <ul className="mt-2 space-y-1">{result.sources.map((source, i) => <li key={i}>{source}</li>)}</ul>
    </details>}
    <p className="text-xs text-muted">Checked {new Date(result.checked_at).toLocaleString()}</p>
    {result.emails && <div className="space-y-4 border-s-2 border-line ps-4">
      {result.emails.length === 0 ? <p>{result.status === 'sources_unavailable'
        ? 'Public sources are unavailable; company email discovery could not be completed.'
        : 'No public company email addresses found.'}</p> : result.emails.map((email, i) => <ResultView key={i} result={email} />)}
    </div>}
  </div>
}

export function FinderJobView({ job, download, busy }: { job: FinderJob; download: () => void; busy: boolean }) {
  const [visible, setVisible] = useState(50)
  return <Card className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-medium">{FINDER_LABELS[job.kind]} results</h2>
      <Button onClick={download} loading={busy} disabled={job.completed === 0}>Download CSV</Button>
    </div>
    <p role="status" className="text-sm">{job.status} · {job.completed} of {job.total} rows processed</p>
    <progress className="h-2 w-full accent-(--color-accent)" value={job.completed} max={job.total} aria-label="Job progress" />
    {job.status === 'queued' && <p className="text-sm text-muted">Waiting for the worker or the next permitted probe window. You can leave this page and return later.</p>}
    {job.status === 'failed' && <Callout variant="danger">The job stopped. Completed rows remain available; inspect their reasons before retrying.</Callout>}
    {job.items.length === 0 && <p className="text-sm text-muted">No completed results yet.</p>}
    <ol className="divide-y divide-line ">{job.items.slice(0, visible).map((item) => <li key={item.row} className="space-y-2 py-4">
      <h3 className="text-sm font-medium wrap-anywhere">Row {item.row}: {Object.values(item.input).join(' · ')}</h3>
      {item.result ? <ResultView result={item.result} /> : <p className="text-sm text-muted">Pending verification</p>}
    </li>)}</ol>
    {visible < job.items.length && <Button onClick={() => { setVisible((count) => count + 50) }}>Show next 50 rows</Button>}
  </Card>
}

export function FinderJobList({ jobs }: { jobs: readonly FinderJob[] }) {
  return <Card>
    <h2 className="mb-4 font-medium">Recent jobs</h2>
    {jobs.length === 0 ? <p className="text-sm text-muted">No jobs yet. Start a lookup to create one.</p> :
      <ul className="divide-y divide-line ">{jobs.map((job) => <li key={job.id}>
        <Link className="flex flex-wrap justify-between gap-2 py-4 text-sm hover:underline" to={`?mode=jobs&job=${job.id}`}>
          <span>{FINDER_LABELS[job.kind]} · {new Date(job.created_at).toLocaleString()}</span>
          <span>{job.status} · {job.completed}/{job.total}</span>
        </Link>
      </li>)}</ul>}
  </Card>
}
