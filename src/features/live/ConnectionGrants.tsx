import { useCallback, useEffect, useRef, useState } from 'react'
import { createConnectionsGateway, type ConnectionPage } from '@/data/http/connectionsGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { createGmailGateway } from '@/data/http/gmailGateway'
import { http, live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'
import { confirm } from '@/ui/confirm'

const connections = createConnectionsGateway(http)
const gmail = createGmailGateway(http)
// AIDEV-NOTE: Account-key remount and response generations prevent another account's credential metadata lingering.
export function ConnectionGrants() {
  const accountId = useLive(state => state.accountId)
  return accountId ? <Grants key={accountId} accountId={accountId} /> : null
}
function Grants({ accountId }: { accountId: string }) {
  const [after, setAfter] = useState<string | null>(null)
  const [page, setPage] = useState<ConnectionPage | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const active = useRef(true)
  const generation = useRef(0)
  const mutation = useRef(false)
  const current = useCallback(() => active.current && live.store.getState().accountId === accountId, [accountId])
  const report = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : 'Connections could not be loaded.')
    if (cause instanceof ApiFailure && cause.kind === 'unauthorized') {
      generation.current++; setPage(null); setNotice(''); setLoading(false)
      void live.recheckSession()
    }
  }, [])
  const load = useCallback(async () => {
    const version = ++generation.current
    setPage(null); setLoading(true); setError('')
    try {
      const result = await connections.list(after)
      if (current() && version === generation.current) setPage(result)
    } catch (cause) {
      if (current() && version === generation.current) report(cause)
    } finally {
      if (current() && version === generation.current) setLoading(false)
    }
  }, [after, current, report])
  useEffect(() => {
    active.current = true; void load()
    return () => { active.current = false }
  }, [load])
  async function revoke(id: string) {
    if (mutation.current) return
    mutation.current = true; setSaving(true)
    try {
      const approved = await confirm({ title: 'Remove this connection?', body: 'Stored access is removed and its mailbox is disconnected. This does not revoke consent at the provider or recall sent mail.', confirmLabel: 'Remove access', danger: true })
      if (!approved || !current()) return
      await connections.revoke(id)
      if (!current()) return
      await load()
      if (current()) await live.refreshMailboxes()
    } catch (cause) {
      if (current()) report(cause)
    } finally {
      mutation.current = false
      if (current()) setSaving(false)
    }
  }
  async function attach(id: string) {
    if (mutation.current || !current()) return
    mutation.current = true; setSaving(true); setError(''); setNotice('')
    try {
      // AIDEV-NOTE: Admission is idempotent, recovering a lost callback response without repeating Google consent.
      const mailbox = await gmail.admit(id)
      if (!current()) return
      await live.refreshMailboxes()
      if (current()) setNotice(`Mailbox ready: ${mailbox.address}. Sending remains disabled.`)
    } catch (cause) {
      if (current()) report(cause)
    } finally {
      mutation.current = false
      if (current()) setSaving(false)
    }
  }
  return <section aria-label="Stored provider connections" className="rounded-xl border border-line p-4">
    <h3 className="font-semibold">Stored provider connections</h3>
    <p className="mt-1 text-sm text-muted">Your account's saved access records. Revoked records remain visible for reference. Use the Gmail connection section to sign in. Set up mailbox can safely retry an interrupted setup using stored access.</p>
    {notice && <p role="status">{notice}</p>}
    {loading && <p role="status">Loading connections…</p>}
    {error && <p role="alert">{error} <Button disabled={loading || saving} onClick={() => void load()}>Reload connections</Button></p>}
    {!loading && page?.items.length === 0 && <p className="mt-3 text-sm text-muted">No stored connections on this page.</p>}
    {page && <ul className="mt-3 divide-y divide-line">{page.items.map(row => <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1 break-all text-sm">{row.provider} · {row.subject}</span>
      <span className="text-sm text-muted">{row.revoked ? 'Access removed' : 'Access stored'}</span>
      {!row.revoked && row.provider === 'gmail' && <Button size="sm" disabled={saving || loading} onClick={() => void attach(row.id)}>Set up mailbox</Button>}
      {!row.revoked && <Button size="sm" disabled={saving || loading} onClick={() => void revoke(row.id)}>Remove access</Button>}
    </li>)}</ul>}
    <div className="mt-3 flex gap-2">
      {after && <Button disabled={loading || saving} onClick={() => setAfter(null)}>First connections page</Button>}
      {page?.next && <Button disabled={loading || saving} onClick={() => setAfter(page.next!.after)}>Next connections page</Button>}
    </div>
  </section>
}
