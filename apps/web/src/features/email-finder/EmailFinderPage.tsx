import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useFeatureGateways } from '@/app/featureGateways'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Callout } from '@/ui/Callout'
import { PageHeader } from '@/ui/PageHeader'
import { FinderKindSchema, FinderRequestSchema, type EmailFinderGateway, type FinderJob,
  type FinderHealth, type FinderSuppression } from './contract'
import { FinderForms, FINDER_LABELS, SuppressionForm } from './FinderForms'
import { FinderHealthPanel, FinderJobList, FinderJobView } from './FinderResults'

export function EmailFinderPage() {
  const { emailFinder } = useFeatureGateways()
  const { context } = useProtectedRequest()
  return <div className="p-6 md:p-8">
    <PageHeader title="Email finder" subtitle="Discover business contacts and check email addresses using self-hosted tools." />
    {!emailFinder ? <Callout heading="Email finder unavailable">This host has not connected the email-finder gateway.</Callout> :
      !context ? <p role="status">Restoring your session…</p> :
        <FinderWorkspace key={`${context.contextId}:${context.authorizationVersion}`} gateway={emailFinder} />}
  </div>
}

function FinderWorkspace({ gateway }: { gateway: EmailFinderGateway }) {
  const { request, proof } = useProtectedRequest()
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') ?? 'person'
  const parsedKind = FinderKindSchema.safeParse(mode)
  const kind = parsedKind.success ? parsedKind.data : 'person'
  const jobId = params.get('job')
  const [health, setHealth] = useState<FinderHealth | null>(null)
  const [jobs, setJobs] = useState<FinderJob[] | null>(null)
  const [selected, setSelected] = useState<FinderJob | null>(null)
  const [suppressions, setSuppressions] = useState<FinderSuppression[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [revision, refresh] = useState(0)

  // AIDEV-NOTE: Session-keyed workspace and protected requests prevent stale tenant data after an account switch.
  useEffect(() => {
    let active = true
    let loading = false
    const load = async () => {
      if (loading) return
      loading = true
      const result = await request(async (ctx, signal) => {
        const [healthPage, jobPage, suppressionPage, detail] = await Promise.all([
          gateway.health(ctx, signal), gateway.jobs(ctx, signal), gateway.suppressions(ctx, signal),
          jobId === null ? Promise.resolve(null) : gateway.job(jobId, ctx, signal),
        ])
        return { healthPage, jobPage, suppressionPage, detail }
      })
      loading = false
      if (!active) return
      if (result.kind === 'ok') {
        setLoadError(null)
        setHealth(result.value.healthPage); setJobs(result.value.jobPage.items)
        setSuppressions(result.value.suppressionPage.items); setSelected(result.value.detail)
      } else if (result.kind === 'failed') setLoadError('Could not load finder data. Check your access and try Refresh.')
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 15_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [gateway, request, jobId, revision])

  const submit = async (input: unknown) => {
    const parsed = FinderRequestSchema.safeParse(input)
    if (!parsed.success) { setError('Check the required fields. CSV files must be UTF-8, no larger than 2 MB, with at most 5,000 rows.'); return }
    if (!proof || busy) return
    setBusy(true); setError(null)
    const result = await request((ctx, signal) => gateway.create(parsed.data, ctx, proof, signal))
    setBusy(false)
    if (result.kind === 'ok') {
      setSelected(result.value); setParams({ mode: 'jobs', job: result.value.id }); refresh((value) => value + 1)
    } else if (result.kind === 'failed') setError('The lookup could not be queued. Check CSV headers and values, then retry.')
  }

  const download = async () => {
    if (!selected || busy) return
    setBusy(true); setError(null)
    const result = await request((ctx, signal) => gateway.export(selected.id, ctx, signal))
    setBusy(false)
    if (result.kind === 'ok') {
      const url = URL.createObjectURL(new Blob([result.value.csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url; link.download = `email-finder-${selected.id}.csv`; link.click()
      window.setTimeout(() => { URL.revokeObjectURL(url) }, 1_000)
    } else if (result.kind === 'failed') setError('The CSV could not be downloaded. Try again.')
  }

  const suppress = async (suppressionKind: 'email' | 'domain' | 'person', value: string) => {
    if (!proof || busy) return
    setBusy(true); setError(null)
    const result = await request((ctx, signal) => gateway.suppress({ kind: suppressionKind, value }, ctx, proof, signal))
    setBusy(false)
    if (result.kind === 'ok') refresh((value) => value + 1)
    else if (result.kind === 'failed') setError('Suppression could not be saved. Check the value and your access.')
  }
  const unsuppress = async (id: string) => {
    if (!proof || busy) return
    setBusy(true); setError(null)
    const result = await request((ctx, signal) => gateway.unsuppress(id, ctx, proof, signal))
    setBusy(false)
    if (result.kind === 'ok') refresh((value) => value + 1)
    else if (result.kind === 'failed') setError('Suppression could not be removed. Try again.')
  }

  return <div className="space-y-6 text-zinc-800 dark:text-zinc-100">
    <nav aria-label="Email finder tools" className="flex flex-wrap gap-2">
      {[...Object.entries(FINDER_LABELS), ['jobs', 'Bulk jobs'], ['suppressions', 'Suppressions']].map(([value, label]) =>
        <Link key={value} to={`?mode=${value}`} aria-current={mode === value ? 'page' : undefined}
          className={`rounded-lg border px-3 py-2 text-sm ${mode === value ? 'border-zinc-400 bg-zinc-100 dark:bg-zinc-800' : 'border-zinc-200 dark:border-zinc-700'}`}>{label}</Link>)}
    </nav>
    {(error || loadError) && <Callout variant="danger" role="alert" actions={<Button onClick={() => { setError(null); refresh((value) => value + 1) }}>Refresh</Button>}>{error ?? loadError}</Callout>}
    <FinderHealthPanel health={health} />
    {mode === 'suppressions' ? <Card className="space-y-6">
      <h2 className="font-medium">Suppression list</h2>
      <p className="text-sm text-zinc-500">Opt-outs apply to every lookup in this workspace, including cached results and bulk jobs. A person entry matches their normalized full name.</p>
      <SuppressionForm busy={busy} add={(entryKind, value) => { void suppress(entryKind, value) }} />
      {suppressions === null ? <p role="status">Loading suppressions…</p> : suppressions.length === 0 ? <p className="text-sm">No suppressions recorded.</p> : <ul className="divide-y divide-zinc-200">
        {suppressions.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <span className="wrap-anywhere">{entry.kind}: {entry.value}</span>
          <Button disabled={busy} onClick={() => { void unsuppress(entry.id) }} aria-label={`Remove suppression for ${entry.value}`}>Remove</Button>
        </li>)}
      </ul>}
    </Card> : mode === 'jobs' ? <>
      {jobId !== null && (selected?.id === jobId ? <FinderJobView key={selected.id} job={selected} busy={busy} download={() => { void download() }} /> : <p role="status">Loading selected job…</p>)}
      {jobs === null ? <p role="status">Loading jobs…</p> : <FinderJobList jobs={jobs} />}
    </> : <FinderForms key={kind} kind={kind} busy={busy} submit={submit} fail={setError} />}
    <p className="text-xs text-zinc-500">Verification describes observed mail-server responses, not permission to contact someone. Honour opt-outs and your lawful basis for processing business contact data.</p>
  </div>
}
