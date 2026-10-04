import { Bot, Construction, Globe, Inbox, Info, Search, Send, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ComponentType } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import type { MailboxPermissions, ServerMailbox } from '@/data/http/contract'
import { live, useLive } from '@/data/http/instance'
import { cx } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Callout, EmptyState, ProgressBar, usePageTitle } from '@/ui/Bits'
import { Button } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { Switch } from '@/ui/Field'
import { toast } from '@/ui/toast'
import { capacitySummary, releaseNote } from './QuotaLine'

const permissionsOf = (m: ServerMailbox): MailboxPermissions => ({ connected: m.connected, sendEnabled: m.sendEnabled, aiRead: m.aiRead, aiDraft: m.aiDraft, aiSend: m.aiSend })

/**
 * One permission change at a time for the whole page. Each change sends the mailbox's full set of flags, so a
 * second change built before the first is confirmed could silently restore a permission that was just removed.
 */
function usePermissionChange(): { pending: boolean; change(mailbox: ServerMailbox, patch: Partial<MailboxPermissions>): void } {
  const [pending, setPending] = useState(false)
  return {
    pending,
    change(mailbox, patch) {
      setPending(true)
      live
        .setPermissions(mailbox.id, { ...permissionsOf(mailbox), ...patch })
        .catch((error: unknown) => toast(error instanceof Error ? error.message : 'The change could not be saved.', { tone: 'error' }))
        .finally(() => setPending(false))
    },
  }
}

function Unavailable({ children }: { children: string }) {
  return (
    <Callout tone="info" icon={Construction}>
      <span className="font-semibold">Not available yet.</span> {children}
    </Callout>
  )
}

function Capacity({ mailboxId }: { mailboxId: string }) {
  const quota = useLive((s) => s.quotas[mailboxId])
  useEffect(() => {
    void live.loadQuota(mailboxId)
  }, [mailboxId])
  if (!quota || quota.status === 'loading' || quota.status === 'idle') return <p className="text-[13px] text-muted">Reading capacity from the server…</p>
  if (quota.status === 'error')
    return (
      <p role="status" className="text-[13px] text-muted">
        Capacity could not be read from the server, so it is not shown.{' '}
        <button type="button" className="font-medium text-accent-text underline underline-offset-2" onClick={() => void live.loadQuota(mailboxId)}>
          Try again
        </button>
      </p>
    )
  const { mailbox } = quota.data
  const note = releaseNote(mailbox)
  return (
    <div className="flex flex-col gap-1 text-[13px]">
      <span className="flex flex-wrap items-center gap-2">
        <span className="w-24">
          <ProgressBar value={mailbox.acceptedUsage + mailbox.heldReservations} max={mailbox.limit} label="Capacity in use, as reported by the server" />
        </span>
        <span className="tabular-nums">{capacitySummary(mailbox)}</span>
        {mailbox.remaining === 0 && <Badge tone="danger">No capacity</Badge>}
      </span>
      {note && <span className="text-muted">{note}</span>}
    </div>
  )
}

function MailboxesSection() {
  const mailboxes = useLive((s) => s.mailboxes)
  const policy = useLive((s) => s.capabilities?.policy)
  const { pending, change } = usePermissionChange()
  const connected = mailboxes.filter((m) => m.connected).length

  const disconnect = async (mailbox: ServerMailbox) => {
    if (!(await confirm({ title: `Disconnect ${mailbox.address}?`, body: 'The server stops using this mailbox for reading, sending and AI access. Its history and the capacity it has used stay recorded. A request already being sent cannot be recalled.', confirmLabel: 'Disconnect', danger: true }))) return
    change(mailbox, { connected: false })
  }

  return (
    <div className="mt-4 flex flex-col gap-5">
      <p className="text-[13px] text-muted">
        {connected}
        {policy ? ` of ${policy.connectedMailboxes}` : ''} mailboxes connected, as recorded by the server.
        {policy ? ` Each may send to at most ${policy.mailboxLimit} recipients in any ${policy.windowHours} hours, and the account ${policy.userLimit}. These limits are provisional and are enforced by the server, not by this page.` : ''}
      </p>
      <Unavailable>Connecting a real Gmail or Google Workspace mailbox, and importing its history, need Google sign-in that is not built. Mailboxes listed here were provisioned for the pilot.</Unavailable>
      {mailboxes.length === 0 ? (
        <EmptyState icon={Inbox} title="No mailboxes on this account" body="The server lists no mailboxes for you." />
      ) : (
        <ul aria-label="Mailboxes" className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {mailboxes.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 break-all text-sm font-semibold">{m.address}</span>
                <Badge tone={m.connected ? 'success' : 'neutral'}>{m.connected ? 'Connected' : 'Disconnected'}</Badge>
                {m.provider === 'fake' && <Badge tone="warn">Simulated provider</Badge>}
                <Button size="sm" variant="ghost" className="ml-auto" disabled={pending} onClick={() => (m.connected ? void disconnect(m) : change(m, { connected: true }))}>
                  {m.connected ? 'Disconnect' : 'Reconnect'}
                </Button>
              </div>
              <Capacity mailboxId={m.id} />
              <Switch label="Allow sending from this mailbox" description="Separate from reading. With this off, the server refuses every send from this mailbox." checked={m.sendEnabled} disabled={pending || !m.connected} onChange={(sendEnabled) => change(m, { sendEnabled })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AiSection() {
  const mailboxes = useLive((s) => s.mailboxes)
  const { pending, change } = usePermissionChange()
  return (
    <div className="mt-4 flex flex-col gap-5">
      <Unavailable>No assistant is connected, so nothing reads mail or writes drafts for you. The permissions below are stored and enforced by the server for when one is.</Unavailable>
      {mailboxes.length === 0 ? (
        <EmptyState icon={Bot} title="No mailboxes on this account" body="AI permissions are set per mailbox." />
      ) : (
        <ul aria-label="AI permissions by mailbox" className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {mailboxes.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-all text-sm font-semibold">{m.address}</span>
                {!m.connected && <Badge tone="neutral">Disconnected · no AI access while disconnected</Badge>}
              </div>
              <Switch label="May read this mailbox" description="Without this, the server gives an assistant none of this mailbox's messages." checked={m.aiRead} disabled={pending || !m.connected} onChange={(aiRead) => change(m, { aiRead })} />
              <Switch label="May prepare drafts" description="Separate from reading. A draft is saved for you to review; it is never approved automatically." checked={m.aiDraft} disabled={pending || !m.connected} onChange={(aiDraft) => change(m, { aiDraft })} />
              <Switch label="AI-prepared messages may be sent after my approval" description="Separate again. Even when on, each message needs your approval of that exact version, and the mailbox must be allowed to send." checked={m.aiSend} disabled={pending || !m.connected} onChange={(aiSend) => change(m, { aiSend })} />
            </li>
          ))}
        </ul>
      )}
      <Callout tone="info" icon={Info}>
        These switches are what the server enforces: which mailboxes can be read, whether drafts can be created, and whether an AI-prepared message can be sent once you approve it. Email text is passed to an assistant marked as untrusted data, but no permission setting can guarantee how an assistant interprets what it reads. That is why drafts are for you to review and nothing is sent without your approval.
      </Callout>
    </div>
  )
}

const SendingSection = () => (
  <div className="mt-4 flex flex-col gap-4">
    <p className="text-[13px] text-muted">Messages are sent from the mailbox you choose when composing, after you approve the exact version. The server's provider is a simulation: an accepted message is a recorded receipt, not a real email.</p>
    <Unavailable>Sending through a real provider, campaign sending identities and scheduled sending are not connected.</Unavailable>
  </div>
)
const EnrichmentSection = () => (
  <div className="mt-4">
    <Unavailable>Contact enrichment is not connected, and there is nowhere to enter a key.</Unavailable>
  </div>
)
const DomainsSection = () => (
  <div className="mt-4">
    <Unavailable>Domain and DNS management is not connected. The server makes no DNS changes, and this page cannot request any.</Unavailable>
  </div>
)

const SECTIONS: Array<{ id: string; label: string; icon: LucideIcon; Panel: ComponentType }> = [
  { id: 'mailboxes', label: 'Mailboxes', icon: Inbox, Panel: MailboxesSection },
  { id: 'sending', label: 'Sending', icon: Send, Panel: SendingSection },
  { id: 'ai', label: 'AI', icon: Bot, Panel: AiSection },
  { id: 'enrichment', label: 'Enrichment', icon: Search, Panel: EnrichmentSection },
  { id: 'domains', label: 'Domains', icon: Globe, Panel: DomainsSection },
]

// AIDEV-NOTE: API-backed Connections. Mailbox ids, counts, permissions and capacity all come from the server;
// sections the server does not support say so and offer no control.
export function LiveConnectionsPage() {
  const { section } = useParams()
  const active = SECTIONS.find((s) => s.id === section)
  usePageTitle(active ? `${active.label} · Connections` : 'Connections')
  // The inventory may have changed in another tab or on the server since sign-in.
  useEffect(() => {
    void live.refreshMailboxes().catch(() => toast('The mailbox list could not be refreshed from the server.', { tone: 'error' }))
  }, [])
  if (!active) return <Navigate to="/connections/mailboxes" replace />

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <nav aria-label="Connections sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3">
        <h1 className="hidden px-3 pb-2 text-base font-semibold md:block">Connections</h1>
        {SECTIONS.map((s) => (
          <Link key={s.id} to={`/connections/${s.id}`} aria-current={s.id === active.id ? 'page' : undefined} className={cx('flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-[13px]', s.id === active.id ? 'bg-accent-soft font-semibold text-accent-text' : 'hover:bg-surface-2')}>
            <s.icon aria-hidden className="size-4 shrink-0" />
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-3xl p-4 md:p-6">
          <h2 className="text-xl font-semibold tracking-tight">{active.label}</h2>
          <active.Panel />
        </div>
      </div>
    </div>
  )
}
