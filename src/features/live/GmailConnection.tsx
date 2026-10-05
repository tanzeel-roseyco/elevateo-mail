import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { createGmailGateway } from '@/data/http/gmailGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'
import { takeGmailCallback } from './gmailCallback'

const gmail = createGmailGateway(http)
function useAction(accountId: string) {
  const active = useRef(true)
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const current = () => active.current && live.store.getState().accountId === accountId
  async function run(action: () => Promise<void>) {
    if (locked.current || !current()) return
    locked.current = true; setBusy(true); setError(''); setMessage('')
    try { await action() } catch (cause) {
      if (!current()) return
      setError(cause instanceof Error ? cause.message : 'Gmail could not be updated.')
      if (cause instanceof ApiFailure && cause.kind === 'unauthorized') void live.recheckSession()
    } finally { locked.current = false; if (current()) setBusy(false) }
  }
  return { busy, message, error, current, run, setMessage }
}
export function GmailConnection() {
  const accountId = useLive(state => state.accountId)
  return accountId ? <Connect key={accountId} accountId={accountId} /> : null
}
function Connect({ accountId }: { accountId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [availabilityError, setAvailabilityError] = useState('')
  const [check, setCheck] = useState(0)
  const action = useAction(accountId)
  useEffect(() => {
    let active = true
    setEnabled(null); setAvailabilityError('')
    void gmail.status().then(result => { if (active && live.store.getState().accountId === accountId) setEnabled(result.enabled) })
      .catch((cause: unknown) => {
        if (!active || live.store.getState().accountId !== accountId) return
        setAvailabilityError('Gmail availability could not be checked.')
        if (cause instanceof ApiFailure && cause.kind === 'unauthorized') void live.recheckSession()
      })
    return () => { active = false }
  }, [accountId, check])
  return <section aria-label="Connect Gmail" className="rounded-xl border border-line p-4">
    <h3 className="font-semibold">Google mailboxes</h3>
    <p className="text-sm text-muted">Connect Gmail or Google Workspace for read-only inbox access. Sending and AI access start disabled.</p>
    {enabled === null && !availabilityError && <p role="status">Checking Gmail availability…</p>}
    {enabled === false && <p>Gmail connection is disabled until server credentials are configured.</p>}
    {availabilityError && <p role="alert">{availabilityError} <Button onClick={() => setCheck(value => value + 1)}>Retry availability</Button></p>}
    <Button disabled={!enabled || action.busy} onClick={() => void action.run(async () => {
      const result = await gmail.begin()
      if (action.current()) window.location.assign(result.authorizationUrl)
    })}>Connect Google mailbox</Button>
    {action.error && <p role="alert">{action.error}</p>}
  </section>
}

export function GmailCallbackPage() {
  const accountId = useLive(state => state.accountId)
  return accountId ? <Complete key={accountId} accountId={accountId} /> : null
}
function Complete({ accountId }: { accountId: string }) {
  const action = useAction(accountId)
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  return <section className="max-w-xl space-y-4 p-6">
    <h1 className="text-xl font-semibold">Finish connecting your Google mailbox</h1>
    <p>Finish the Google authorization you requested. Sending must be enabled separately in Connections; this step does not enable sending or AI access.</p>
    <Button disabled={action.busy || (attempted && !connectionId)} onClick={() => void action.run(async () => {
      let id = connectionId
      if (!id) {
        const callback = takeGmailCallback(); setAttempted(true)
        if (!callback) throw new Error('This connection link has expired. Start again from Connections.')
        const result = await gmail.complete(callback)
        if (!action.current()) return
        id = result.connectionId; setConnectionId(id)
      }
      const mailbox = await gmail.admit(id)
      if (!action.current()) return
      await live.refreshMailboxes()
      if (action.current()) { setConnectionId(null); action.setMessage(`Connected ${mailbox.address}. Use Sync one page to import inbox history.`) }
    })}>{connectionId ? 'Retry mailbox setup' : 'Finish connection'}</Button>
    {action.message && <p role="status">{action.message}</p>}
    {action.error && <p role="alert">{action.error} If authorization already finished, its access record remains in Connections.</p>}
    <Link className="block underline" to="/connections/mailboxes">Back to Connections</Link>
  </section>
}

export function GmailSyncButton({ mailboxId }: { mailboxId: string }) {
  const accountId = useLive(state => state.accountId)
  return accountId ? <Sync key={`${accountId}/${mailboxId}`} accountId={accountId} mailboxId={mailboxId} /> : null
}
function Sync({ accountId, mailboxId }: { accountId: string; mailboxId: string }) {
  const action = useAction(accountId)
  return <div><Button size="sm" disabled={action.busy} onClick={() => void action.run(async () => {
    const result = await gmail.sync(mailboxId)
    if (!action.current()) return
    await live.refreshMailboxes()
    if (!action.current()) return
    await live.reloadPage()
    if (action.current()) action.setMessage(result.status === 'caught_up' ? 'Inbox caught up.' : 'Page processed. Sync again to continue.')
  })}>Sync one page</Button>{action.message && <p role="status">{action.message}</p>}{action.error && <p role="alert">{action.error}</p>}</div>
}
