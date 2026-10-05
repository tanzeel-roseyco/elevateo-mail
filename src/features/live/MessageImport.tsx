import { useEffect, useRef, useState } from 'react'
import { createImportGateway, parseHistoricalImport, type HistoricalImport } from '@/data/http/importGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'

const gateway = createImportGateway(http)
// AIDEV-NOTE: Account/mailbox keyed mounting and request generations prevent late file/HTTP results crossing identities.
export function MessageImport({ mailboxId }: { mailboxId: string }) {
  const accountId = useLive(state => state.accountId)
  return accountId ? <ImportPanel key={`${accountId}:${mailboxId}`} accountId={accountId} mailboxId={mailboxId} /> : null
}
function ImportPanel({ mailboxId, accountId }: { mailboxId: string; accountId: string }) {
  const [payload, setPayload] = useState<HistoricalImport | null>(null)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const current = (id: number) => active.current && id === generation.current && live.store.getState().accountId === accountId
  async function select(file?: File) {
    const id = ++generation.current
    setPayload(null); setNotice(''); setError(''); setReading(Boolean(file))
    if (!file) return
    try {
      if (file.size > 131_072) throw new Error('Choose a JSON file no larger than 128 KiB.')
      const parsed = parseHistoricalImport(await file.text())
      if (current(id)) setPayload(parsed)
    } catch (cause) { if (current(id)) setError(cause instanceof Error ? cause.message : 'Could not read this file.') }
    finally { if (current(id)) setReading(false) }
  }
  async function submit() {
    if (!payload || busy || !current(generation.current)) return
    const id = ++generation.current
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await gateway.import(mailboxId, payload)
      if (!current(id)) return
      setNotice(`${result.imported} messages imported; ${result.unchanged} already present.`)
      setPayload(null)
      await live.reloadPage()
    } catch (cause) {
      if (!current(id)) return
      setError(cause instanceof Error ? cause.message : 'Import failed. You can retry the same file safely.')
      if (cause instanceof ApiFailure && cause.kind === 'unauthorized') {
        setPayload(null); setNotice(''); void live.recheckSession()
      }
    } finally { if (current(id)) setBusy(false) }
  }
  return <section aria-label="Import historical messages" className="rounded-xl border border-line bg-surface p-4 text-sm">
    <h2 className="font-semibold">Import historical messages</h2>
    <p className="my-2 text-muted">JSON only, up to 25 messages and 128 KiB per file. MBOX and attachments are not supported yet. Imports do not send emails.</p>
    <p className="mb-2 text-xs text-muted">Use a messages array with id, threadId, sender, subject, body (plain text) and at (Unix milliseconds). Keep IDs unchanged for safe retries.</p>
    <label className="block">Historical JSON file<input className="mt-2 block w-full" type="file" accept=".json,application/json" disabled={busy}
      onChange={event => void select(event.target.files?.[0])} /></label>
    {reading && <p role="status">Reading file…</p>}
    {payload && <p className="my-2">Ready to import {payload.messages.length} messages into this mailbox.</p>}
    <Button className="mt-3" variant="primary" disabled={!payload || busy || reading} onClick={() => void submit()}>{busy ? 'Importing…' : 'Confirm import'}</Button>
    {notice && <p role="status" className="mt-2">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
  </section>
}
