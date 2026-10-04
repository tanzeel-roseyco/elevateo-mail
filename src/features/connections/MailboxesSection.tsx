import { History, Inbox, Info, Plus, Unplug } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { gateway } from '@/data/gateway'
import { useData } from '@/data/store'
import { canonicalAddress, checkNewMailbox, isDemoMailbox, quotaUsage, sentTodayByAddress, userDailyCeiling } from '@/domain/connections'
import { identityDomain } from '@/domain/identities'
import { DAILY_LIMIT_MAX, MAX_MAILBOXES_PER_USER, type MailboxConnection } from '@/domain/schema'
import { useOnline } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Callout, DomainDot, EmptyState, ProgressBar, useNow } from '@/ui/Bits'
import { Button } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { Field, Input } from '@/ui/Field'
import { toast } from '@/ui/toast'

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Nothing was changed.')

function ConnectForm({ mailboxes, online }: { mailboxes: MailboxConnection[]; online: boolean }) {
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const full = mailboxes.length >= MAX_MAILBOXES_PER_USER

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const check = checkNewMailbox(address, mailboxes)
    if (!check.ok) return setError(check.reason)
    setError(null)
    setBusy(true)
    gateway
      .connectMailbox(check.address)
      .then(() => {
        setAddress('')
        toast(`Simulated connection added for ${check.address}. No Google account was contacted.`, { tone: 'success' })
      })
      .catch((err: unknown) => setError(message(err)))
      .finally(() => setBusy(false))
  }

  if (full)
    return (
      <Callout tone="info" icon={Info}>
        All {MAX_MAILBOXES_PER_USER} mailbox places are in use. Disconnect one to connect another.
      </Callout>
    )
  return (
    <form noValidate onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
      <Field label="Mailbox address" error={error} hint="Gmail or Google Workspace. The real app will open Google sign-in; it never asks for a password here." className="min-w-0">
        {(p) => <Input {...p} type="email" autoComplete="off" placeholder="name@example.com" disabled={busy} value={address} onChange={(e) => setAddress(e.target.value)} />}
      </Field>
      {/* Offset below the label so the button lines up with the input when they share a row. */}
      <Button type="submit" variant="primary" className="justify-self-start sm:mt-[22px]" disabled={busy || !online} icon={<Plus aria-hidden className="size-4" />}>
        {busy ? 'Connecting…' : 'Connect mailbox (simulated)'}
      </Button>
    </form>
  )
}

function MailboxRow({ mailbox, sent, online }: { mailbox: MailboxConnection; sent: number; online: boolean }) {
  const [busy, setBusy] = useState(false)
  const usage = quotaUsage(sent)
  const identities = useData((s) => s.identities)
  const demo = isDemoMailbox(mailbox, identities)

  const importHistory = () => {
    setBusy(true)
    gateway
      .importMailboxHistory(mailbox.id)
      .then(({ importedConversations }) => toast(`Simulated import finished: ${importedConversations} demo conversations for ${mailbox.address}.`, { tone: 'success' }))
      .catch((err: unknown) => toast(message(err), { tone: 'error' }))
      .finally(() => setBusy(false))
  }
  const disconnect = async () => {
    if (!(await confirm({ title: `Disconnect ${mailbox.address}?`, body: 'This removes the simulated connection from this browser. The assistant loses access to it, and sends already counted today stay counted if you reconnect it.', confirmLabel: 'Disconnect', danger: true }))) return
    // Busy for the whole request so a second confirmation cannot race the first.
    setBusy(true)
    gateway
      .disconnectMailbox(mailbox.id)
      .then(() => toast(`Simulated connection for ${mailbox.address} removed.`))
      .catch((err: unknown) => {
        toast(message(err), { tone: 'error' })
        // Only on failure: after success this row is gone, and setting state on it would be a no-op at best.
        setBusy(false)
      })
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3">
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <DomainDot domain={identityDomain(mailbox.address)} />
        <span className="min-w-0 break-all text-sm font-semibold">{mailbox.address}</span>
        <Badge tone="neutral">{demo ? 'Demo mailbox · Google (simulated)' : 'Google · simulated'}</Badge>
        <Badge tone={mailbox.sendEnabled ? 'success' : 'warn'}>{mailbox.sendEnabled ? 'Read and send' : 'Read only'}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        <span className="flex items-center gap-2">
          <span className="w-24">
            <ProgressBar value={usage.used} max={usage.limit} label={`${mailbox.address} simulated sends today`} />
          </span>
          <span className="tabular-nums">
            {usage.used} / {usage.limit} sent today
          </span>
          {usage.level !== 'ok' && <Badge tone={usage.level === 'reached' ? 'danger' : 'warn'}>{usage.level === 'reached' ? 'Limit reached' : 'Near limit'}</Badge>}
        </span>
        <span className="text-muted">{mailbox.historyImport === 'complete' ? `History imported · ${mailbox.importedConversations} conversations (simulated)` : 'History not imported'}</span>
      </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {mailbox.historyImport === 'not_started' && (
          <Button size="sm" disabled={busy || !online} onClick={importHistory} icon={<History aria-hidden className="size-3.5" />}>
            {busy ? 'Importing…' : 'Import history (simulated)'}
          </Button>
        )}
        {!demo && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()} icon={<Unplug aria-hidden className="size-3.5" />}>
            Disconnect
          </Button>
        )}
      </div>
    </li>
  )
}

// AIDEV-NOTE: Mailbox list with per-mailbox daily usage. Connect/import go through the gateway; nothing reaches Google.
export function MailboxesSection() {
  const mailboxes = useData((s) => s.connections.mailboxes)
  const events = useData((s) => s.events)
  const online = useOnline()
  const tick = useNow()
  // Read the clock fresh as well as on the minute tick, so a send made since the last tick is not treated as future-dated.
  const sentToday = useMemo(() => sentTodayByAddress(events, Math.max(tick, Date.now())), [events, tick])

  return (
    <div className="mt-4 flex flex-col gap-5">
      <p className="text-[13px] text-muted">
        {mailboxes.length} of {MAX_MAILBOXES_PER_USER} mailboxes connected. Each mailbox may send up to {DAILY_LIMIT_MAX} emails a day, so this account can send at most {userDailyCeiling(mailboxes.length)} a day across manual, campaign and AI-assisted mail.
      </p>
      <Callout tone="info" icon={Info}>
        This is a preview. Connecting records an address in this browser only: no Google account is opened, no mail is fetched and no credentials are stored. Usage counts simulated sends since midnight; the final counting rule is still to be confirmed.
      </Callout>
      <ConnectForm mailboxes={mailboxes} online={online} />
      {mailboxes.length === 0 ? (
        <EmptyState icon={Inbox} title="No mailboxes connected" body="Connect a Gmail or Google Workspace mailbox to see its mail here." />
      ) : (
        <ul aria-label="Connected mailboxes" className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {mailboxes.map((m) => (
            <MailboxRow key={m.id} mailbox={m} sent={sentToday.get(canonicalAddress(m.address)) ?? 0} online={online} />
          ))}
        </ul>
      )}
    </div>
  )
}
