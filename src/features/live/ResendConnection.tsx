import { useEffect, useRef, useState } from 'react'
import { createResendGateway, type ResendConnectionMetadata } from '@/data/http/resendGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'
import { confirm } from '@/ui/confirm'

const gateway = createResendGateway(http)
export function ResendConnection() {
  const accountId = useLive(state => state.accountId)
  return accountId ? <Panel key={accountId} accountId={accountId} /> : null
}
function Panel({ accountId }: { accountId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [rows, setRows] = useState<ResendConnectionMetadata[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const secret = useRef<HTMLInputElement>(null)
  const active = useRef(true)
  const locked = useRef(false)
  const current = () => active.current && live.store.getState().accountId === accountId
  const clearSecret = () => { if (secret.current) secret.current.value = '' }
  // AIDEV-NOTE: Account-key remount and response fences keep old account metadata/actions out of a new session.
  async function load() {
    clearSecret(); setEnabled(null)
    // AIDEV-NOTE: Removing access must remain possible when encryption/provider configuration is unavailable.
    const result = await gateway.list()
    if (!current()) return
    setRows(result.connections); setSelected('')
    try {
      const status = await gateway.status()
      if (current()) setEnabled(status.enabled)
    } catch (cause) {
      if (cause instanceof ApiFailure && cause.kind === 'unauthorized') throw cause
      if (current()) setEnabled(false)
    }
  }
  async function run(action: () => Promise<void>) {
    if (locked.current || !current()) return
    locked.current = true; setBusy(true); setError(''); setMessage('')
    try { await action() } catch (cause) {
      if (!current()) return
      // Never echo transport/provider details next to a secret input.
      setError('Resend could not be updated. Reload connections before retrying an uncertain change.')
      if (cause instanceof ApiFailure && cause.kind === 'unauthorized') {
        clearSecret(); setRows([]); setEnabled(false); setSelected(''); void live.recheckSession()
      }
    } finally { locked.current = false; if (current()) setBusy(false) }
  }
  useEffect(() => {
    active.current = true
    void run(load)
    return () => { active.current = false; clearSecret() }
    // Account-keyed mounting intentionally starts one availability check per account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const connection = rows.find(row => row.id === selected && !row.revoked)
  return <section aria-label="Resend connections" className="space-y-3 rounded-xl border border-line p-4">
    <h3 className="font-semibold">Resend sender connections</h3>
    <p className="text-sm text-muted">Store your own key and verify a sender domain. This does not connect an inbox or enable sending.</p>
    {enabled === null && !error && <p role="status">Checking Resend availability…</p>}
    {enabled === false && <p>Resend is disabled until server encryption and provider configuration are ready.</p>}
    <Button disabled={busy} onClick={() => { clearSecret(); void run(load) }}>Reload Resend connections</Button>
    <>
      <p className="text-sm text-muted">Up to ten connection records, including removed records. Replacing a key disconnects its senders; verify them again.</p>
      {rows.length === 0 && <p>No stored Resend connections.</p>}
      <ul>{rows.map(row => <li key={row.id} className="break-all">{row.id} — revision {row.revision} — {row.revoked ? 'Removed' : 'Stored'}</li>)}</ul>
      <label className="block">Connection to manage
        <select aria-label="Connection to manage" value={selected} disabled={busy} onChange={event => { clearSecret(); setSelected(event.target.value) }}>
          <option value="">{enabled ? 'New connection' : 'Select a connection'}</option>
          {rows.filter(row => !row.revoked).map(row => <option key={row.id} value={row.id}>{row.id}</option>)}
        </select>
      </label>
      {enabled && <form onSubmit={event => {
        event.preventDefault()
        if (!enabled || busy || !current()) return
        const apiKey = secret.current?.value ?? ''
        clearSecret()
        void run(async () => {
          if (connection) await gateway.replace(connection.id, connection.revision, apiKey)
          else await gateway.create(apiKey)
          if (!current()) return
          await live.refreshMailboxes()
          if (!current()) return
          await load()
          if (current()) setMessage('Key stored. Verify a sender before any separate sending setup.')
        })
      }}>
        <label className="block">Resend API key <input ref={node => { if (!node) clearSecret(); secret.current = node }} type="password" name="resend-key" autoComplete="off" maxLength={8192} required disabled={busy} /></label>
        <Button type="submit" disabled={busy || (!connection && rows.length >= 10)}>{connection ? 'Replace key' : 'Store key'}</Button>
      </form>}
      {connection && <>
        <Button disabled={busy} onClick={() => void run(async () => {
          clearSecret()
          if (!await confirm({ title: 'Remove Resend access?', body: 'This removes the stored key and disconnects its senders.', confirmLabel: 'Remove access', danger: true }) || !current()) return
          await gateway.revoke(connection.id, connection.revision)
          if (!current()) return
          await live.refreshMailboxes()
          if (current()) await load()
        })}>Remove Resend access</Button>
        {enabled && <form onSubmit={event => {
          event.preventDefault()
          if (!enabled || busy || !current()) return
          const form = new FormData(event.currentTarget)
          void run(async () => {
            const result = await gateway.admit(connection.id, String(form.get('address') ?? ''), String(form.get('domain') ?? ''))
            if (!current()) return
            await live.refreshMailboxes()
            if (current()) setMessage(`Verified ${result.address}. Sending remains disabled.`)
          })
        }}>
          <label className="block">Sender address <input name="address" type="email" maxLength={254} required disabled={busy} /></label>
          <label className="block">Resend domain ID <input name="domain" maxLength={128} required disabled={busy} /></label>
          <Button type="submit" disabled={busy}>Verify sender</Button>
        </form>}
      </>}
    </>
    {busy && <p role="status">Updating Resend connections…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
