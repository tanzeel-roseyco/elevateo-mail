import { useEffect, useRef, useState } from 'react'
import { createGmailGateway, type GmailSendingStatus } from '@/data/http/gmailGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'
import { Switch } from '@/ui/Field'

const gmail = createGmailGateway(http)
export function GmailSending({ mailboxId }: { mailboxId: string }) {
  const accountId = useLive(state => state.accountId)
  return accountId ? <Panel key={`${accountId}/${mailboxId}`} accountId={accountId} mailboxId={mailboxId} /> : null
}
function Panel({ accountId, mailboxId }: { accountId: string; mailboxId: string }) {
  const [status, setStatus] = useState<GmailSendingStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  const locked = useRef(false)
  const current = () => active.current && live.store.getState().accountId === accountId
  // AIDEV-NOTE: One action at a time; remount and account fences discard late permission responses.
  async function run(action: () => Promise<void>) {
    if (locked.current || !current()) return
    locked.current = true; setBusy(true); setError('')
    try { await action() } catch (cause) {
      if (!current()) return
      setStatus(null)
      setError('Gmail sending permission could not be checked or saved. Reload before trying again.')
      if (cause instanceof ApiFailure && cause.kind === 'unauthorized') void live.recheckSession()
    } finally { locked.current = false; if (current()) setBusy(false) }
  }
  async function load() {
    const result = await gmail.sendingStatus(mailboxId)
    if (current()) setStatus(result)
  }
  useEffect(() => {
    active.current = true; void run(load)
    return () => { active.current = false }
    // Account and mailbox changes remount this panel; no polling or background permission grants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div className="space-y-2 rounded-lg border border-line p-3">
    <p className="text-sm font-semibold">Gmail sending permission</p>
    <p className="text-sm text-muted">Authorize Google first, then enable this mailbox separately. Every message still needs your approval.</p>
    {busy && <p role="status">Checking or updating permission…</p>}
    {error && <p role="alert">{error}</p>}
    <Button size="sm" disabled={busy} onClick={() => void run(load)}>Reload sending permission</Button>
    {status && <>
      {!status.available && <p className="text-sm text-muted">Live Gmail delivery is disabled in server configuration. You can still turn mailbox sending off.</p>}
      {!status.authorized && <Button size="sm" disabled={busy || !status.available || !status.connectionId} onClick={() => void run(async () => {
        if (!status.connectionId) return
        const result = await gmail.beginSending(status.connectionId)
        if (current()) window.location.assign(result.authorizationUrl)
      })}>Authorize Google sending</Button>}
      <Switch label="Allow sending from this Gmail mailbox" checked={status.enabled}
        description="Turning this off invalidates pending approvals. Turning it back on does not restore them."
        disabled={busy || (!status.enabled && (!status.available || !status.authorized))}
        onChange={enabled => void run(async () => {
          await gmail.setSending(mailboxId, enabled)
          if (!current()) return
          await load()
          if (current()) await live.refreshMailboxes()
        })} />
    </>}
  </div>
}
