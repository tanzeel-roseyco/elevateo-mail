import { useEffect, useRef, useState } from 'react'
import { createHunterGateway, type HunterConnection as Connection, type HunterProfile } from '@/data/http/hunterGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'

const gateway = createHunterGateway(http)
export function HunterConnection() {
  const accountId = useLive(state => state.accountId)
  return accountId ? <Panel key={accountId} accountId={accountId} /> : null
}
function Panel({ accountId }: { accountId: string }) {
  const [enabled, setEnabled] = useState(false)
  const [connection, setConnection] = useState<Connection>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const [email, setEmail] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [profile, setProfile] = useState<HunterProfile>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const secret = useRef<HTMLInputElement>(null)
  const active = useRef(true)
  const locked = useRef(false)
  const current = () => active.current && live.store.getState().accountId === accountId
  const clearSecret = () => { if (secret.current) secret.current.value = '' }
  // AIDEV-NOTE: Lost lookup responses may have spent a credit; never retry or retain acknowledgement automatically.
  async function run(action: () => Promise<void>) {
    if (locked.current || !current() || expired) return
    locked.current = true; setBusy(true); setError(''); setMessage(''); setProfile(null)
    try { await action() } catch (cause) {
      if (!current()) return
      clearSecret(); setLoaded(false); setAcknowledged(false)
      setError('Hunter could not complete this request. A lookup may have used a credit. Reload access before another action.')
      if (cause instanceof ApiFailure && cause.kind === 'unauthorized') {
        setExpired(true); setConnection(null); setEmail(''); setEnabled(false); void live.recheckSession()
      }
    } finally { locked.current = false; if (current()) setBusy(false) }
  }
  async function load() {
    clearSecret(); setLoaded(false); setEnabled(false)
    const result = await gateway.connection()
    if (!current()) return
    setConnection(result.connection); setLoaded(true)
    // AIDEV-NOTE: Configuration failure must not prevent revoking an independently stored key.
    try {
      const status = await gateway.status()
      if (current()) setEnabled(status.enabled)
    } catch (cause) {
      if (cause instanceof ApiFailure && cause.kind === 'unauthorized') throw cause
      if (current()) setError('Hunter configuration is unavailable. Stored access can still be removed.')
    }
  }
  useEffect(() => {
    active.current = true; void run(load)
    return () => { active.current = false; clearSecret() }
    // AIDEV-NOTE: Account-keyed remount starts one read; late private results cannot cross account boundaries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <section className="mt-4 space-y-3 rounded-xl border border-line p-4" aria-label="Hunter enrichment">
    <h3 className="font-semibold">Hunter enrichment (optional)</h3>
    <p>Look up background details for a contact already saved in your account. AI handles personalisation separately. Enrichment never creates consent.</p>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {busy && <p role="status">Working with Hunter access…</p>}
    {!expired && <Button disabled={busy} onClick={() => void run(load)}>Reload Hunter access</Button>}
    {loaded && !expired && <>
      {!enabled && <p>Hunter lookups are disabled in server configuration. Stored access can still be removed.</p>}
      <p>{connection && !connection.revoked ? 'A Hunter key is stored for your account.' : 'No active Hunter key.'}</p>
      {enabled && <form onSubmit={event => {
        event.preventDefault(); const key = secret.current?.value ?? ''; clearSecret()
        void run(async () => { const result = await gateway.save(key, connection?.revision ?? null); if (current()) { setConnection(result.connection); setMessage('Hunter access saved. No lookup was made.') } })
      }}>
        <label className="block">Hunter API key <input ref={secret} type="password" autoComplete="off" maxLength={8192} required disabled={busy} /></label>
        <Button disabled={busy} type="submit">Save Hunter access</Button>
      </form>}
      {connection && !connection.revoked && <Button disabled={busy} onClick={() => void run(async () => {
        clearSecret(); const result = await gateway.revoke(connection.revision)
        if (current()) { setConnection(result.connection); setMessage('Hunter access removed.') }
      })}>Remove Hunter access</Button>}
      {enabled && connection && !connection.revoked && <form className="space-y-2" onSubmit={event => {
        event.preventDefault(); if (!acknowledged) return; setAcknowledged(false)
        void run(async () => { const result = await gateway.enrich(email); if (current()) { setProfile(result.profile); setMessage(result.profile ? 'Profile found. Your contact was not changed.' : 'No profile was found.') } })
      }}>
        <label className="block">Saved contact email <input type="email" maxLength={254} required value={email} disabled={busy} onChange={event => { setEmail(event.target.value); setProfile(null); setMessage(''); setAcknowledged(false) }} /></label>
        <label className="block"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /> I agree this lookup may use my Hunter credits.</label>
        <Button type="submit" disabled={busy || !acknowledged}>Look up contact</Button>
      </form>}
      {profile && <dl>{Object.entries(profile).map(([name, value]) => <div key={name}><dt>{{ fullName: 'Name', title: 'Role', company: 'Company', companyDomain: 'Company domain', location: 'Location' }[name]}</dt><dd>{value ?? 'Not provided'}</dd></div>)}</dl>}
    </>}
    <p className="text-sm text-muted">AMF integration is not connected.</p>
  </section>
}
