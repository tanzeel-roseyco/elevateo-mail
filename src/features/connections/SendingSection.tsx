import { HelpCircle, Info, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { useData } from '@/data/store'
import { userDailyCeiling } from '@/domain/connections'
import { DAILY_LIMIT_MAX, type ResendIdentity } from '@/domain/schema'
import { Badge, StatusBadge } from '@/ui/Badge'
import { Callout } from '@/ui/Bits'

const PURPOSE: Record<ResendIdentity['purpose'], { label: string; note: string }> = {
  campaign: { label: 'Campaign', note: 'Opted-in campaign recipients only. Always carries an unsubscribe link.' },
  transactional: { label: 'Transactional', note: 'One-off service messages. Never used for campaigns.' },
}

// Each safeguard states what the prototype really does today, so nothing reads as a delivery promise.
const SAFEGUARDS: Array<{ name: string; detail: string }> = [
  { name: 'Consent records', detail: 'Campaigns accept only contacts recorded as opted in. Unconfirmed contacts are excluded.' },
  { name: 'Unsubscribe', detail: 'Every campaign email carries an unsubscribe footer; unsubscribed contacts are blocked from further sends.' },
  { name: 'Suppression', detail: 'Bounced, unsubscribed and suppressed addresses are refused for campaign email, both when the campaign is built and again when each message is dispatched.' },
  { name: 'Bounces and complaints', detail: 'A bounce or complaint will suppress the address. In this prototype those events are demo data.' },
  { name: 'Stop on reply', detail: 'A reply will end the follow-up sequence for that recipient. In this prototype replies are demo data.' },
]

// AIDEV-NOTE: Explains the two outgoing routes and why they stay separate. Read-only: routing is decided by the backend.
export function SendingSection() {
  const mailboxes = useData((s) => s.connections.mailboxes)
  const resend = useData((s) => s.connections.resendIdentities)
  const sending = mailboxes.filter((m) => m.sendEnabled).length

  return (
    <div className="mt-4 flex flex-col gap-6">
      <section aria-labelledby="cx-routes" className="flex flex-col gap-3">
        <h3 id="cx-routes" className="text-base font-semibold">
          Two separate routes (planned)
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-4">
            <p className="eyebrow">Your Google mailboxes</p>
            <p className="mt-1.5 text-sm font-semibold">Personal mail and replies</p>
            <p className="mt-1 text-[13px] text-muted">Will be sent by the mailbox itself, so replies arrive in the same inbox. Needs Gmail send permission for each mailbox, granted separately from reading. In this preview all sending is simulated.</p>
            <p className="mt-2 text-[13px]">
              {sending} of {mailboxes.length} mailboxes may send · {DAILY_LIMIT_MAX} a day each · {userDailyCeiling(sending)} a day in total
            </p>
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="eyebrow">Resend (optional)</p>
            <p className="mt-1.5 text-sm font-semibold">Opted-in campaigns</p>
            <p className="mt-1 text-[13px] text-muted">Will send through verified identities on approved subdomains. It does not host an inbox: replies return to one of your connected mailboxes.</p>
            <p className="mt-2 text-[13px]">Separate permission and separate identities from mailbox sending. Campaign and transactional identities are never mixed.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="cx-resend" className="flex flex-col gap-3">
        <h3 id="cx-resend" className="text-base font-semibold">
          Resend identities
        </h3>
        {resend.length === 0 ? (
          <p className="text-[13px] text-muted">No Resend identities are configured.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {resend.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
                <span className="min-w-0 break-all text-sm font-semibold">{r.address}</span>
                <Badge tone="accent">{PURPOSE[r.purpose].label}</Badge>
                <StatusBadge status={r.status} />
                <p className="w-full text-[13px] text-muted">{PURPOSE[r.purpose].note}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Example data. No Resend account or key is connected, and verification status here is not checked against DNS.</p>
      </section>

      <Callout tone="warn" icon={HelpCircle}>
        <p className="font-semibold">Two limit rules still need your decision</p>
        <ul className="mt-1 list-disc pl-4">
          <li>When a mailbox’s day starts and ends (a fixed midnight, or a rolling 24 hours).</li>
          <li>Whether an email to several To, CC and BCC addresses counts once or once per address.</li>
        </ul>
        <p className="mt-1">Until then this preview counts each recipient since local midnight and blocks nothing.</p>
      </Callout>

      <section aria-labelledby="cx-safeguards" className="flex flex-col gap-3">
        <h3 id="cx-safeguards" className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck aria-hidden className="size-4 text-success" />
          Safeguards on every campaign
        </h3>
        <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line text-[13px]">
          {SAFEGUARDS.map((s) => (
            <div key={s.name} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[11rem_1fr]">
              <dt className="font-semibold">{s.name}</dt>
              <dd className="text-muted">{s.detail}</dd>
            </div>
          ))}
        </dl>
        <Callout tone="info" icon={Info}>
          Limits and safeguards reduce risk; they do not guarantee that mail reaches an inbox. Sending window, pace and footer are set in{' '}
          <Link to="/settings/sending" className="font-medium text-accent-text underline underline-offset-2">
            Settings → Sending
          </Link>
          .
        </Callout>
      </section>
    </div>
  )
}
