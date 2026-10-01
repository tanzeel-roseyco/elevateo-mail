import { Info, MessageSquare, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useData } from '@/data/store'
import { EVENT_LABELS } from '@/domain/activity'
import { lastMessage, sortByRecent } from '@/domain/mail'
import { campaignMetrics, dailyLimitError, percent, sendingWindowError } from '@/domain/rules'
import { plainPreview } from '@/domain/richText'
import { DELIVERY_STATES, type Campaign } from '@/domain/schema'
import { formatDateTime, formatWhen } from '@/lib/format'
import { StatusBadge } from '@/ui/Badge'
import { Callout, clampPage, EmptyState, PAGE_SIZE, Pagination, ProgressBar, RichText, UnsubscribeFooter } from '@/ui/Bits'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { toast } from '@/ui/toast'

// AIDEV-NOTE: One component per campaign detail tab; each receives the campaign and reads anything else it needs.

interface TabProps {
  campaign: Campaign
}

export function OverviewTab({ campaign }: TabProps) {
  const m = campaignMetrics(campaign)
  const tiles = [
    { label: 'Sent', value: m.sent, note: `${percent(m.sent, m.total)} of audience` },
    { label: 'Delivered', value: m.delivered, note: `${percent(m.delivered, m.sent)} of sent · not the same as read` },
    { label: 'Replies', value: m.replies, note: `${percent(m.replies, m.delivered)} of delivered` },
    { label: 'Bounces', value: m.bounced, note: `${percent(m.bounced, m.sent)} of sent` },
    { label: 'Unsubscribes', value: m.unsubscribes, note: `${percent(m.unsubscribes, m.delivered)} of delivered` },
    { label: 'Failed', value: m.failed, note: 'Not sent; needs review' },
  ]
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <section aria-label="Progress">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium">
            {m.sent + m.skipped} of {m.total} recipients processed
          </span>
          <span className="text-muted">
            {m.pending} pending{m.skipped > 0 && ` · ${m.skipped} skipped (suppressed)`}
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar value={m.sent + m.skipped} max={m.total} label="Campaign progress" />
        </div>
      </section>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-line p-3.5">
            <dt className="text-[13px] font-medium text-muted">{t.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</dd>
            <dd className="mt-0.5 text-xs text-muted">{t.note}</dd>
          </div>
        ))}
      </dl>
      <Callout tone="info" icon={Info}>
        Figures come from simulated events. In production they would be driven by Resend delivery, bounce, and inbound webhooks.
      </Callout>
    </div>
  )
}

const RECIPIENT_FILTERS = [...DELIVERY_STATES, 'replied'] as const

/** A tab's filter and page live in the URL (STANDARDS §5), so Back and shared links restore them. */
function useTabParams() {
  const [search, setSearch] = useSearchParams()
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    // A different filter is a different list: start again from its first page.
    if (key !== 'page') next.delete('page')
    setSearch(next, { replace: true })
  }
  return { search, set, setPage: (page: number) => set('page', page > 1 ? String(page) : '') }
}

export function RecipientsTab({ campaign }: TabProps) {
  const contacts = useData((s) => s.contacts)
  const { search, set, setPage } = useTabParams()
  const status = RECIPIENT_FILTERS.find((f) => f === search.get('status')) ?? ''
  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])
  const rows = campaign.recipients.filter((r) => !status || (status === 'replied' ? r.replied : r.delivery === status))
  // Clamped: a simulated batch can shrink a filtered list below the page named in the URL.
  const page = clampPage(search.get('page'), rows.length)
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (campaign.recipients.length === 0) {
    return <EmptyState icon={Users} title="No recipients yet" body="This campaign has no audience. Create a new campaign to choose recipients from your opted-in contacts." />
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 py-2 md:px-6">
        <Select aria-label="Filter recipients by status" className="w-48" value={status} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {DELIVERY_STATES.map((s) => (
            <option key={s} value={s}>
              {s[0]?.toUpperCase() + s.slice(1)}
            </option>
          ))}
          <option value="replied">Replied</option>
        </Select>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <caption className="sr-only">Campaign recipients</caption>
          <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
            <tr>
              {['Contact', 'Company', 'Delivery', 'Response', 'Last event'].map((h) => (
                <th key={h} scope="col" className="px-4 py-2 font-medium md:first:pl-6">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const contact = byId.get(r.contactId)
              return (
                <tr key={r.contactId} className="border-b border-line">
                  <th scope="row" className="row px-4 font-normal md:pl-6">
                    <Link to={`/contacts?contact=${r.contactId}`} className="font-medium hover:underline">
                      {contact?.name ?? 'Removed contact'}
                    </Link>
                    <span className="block text-xs text-muted">{contact?.email}</span>
                  </th>
                  <td className="row px-4 text-muted">{contact?.company ?? '—'}</td>
                  <td className="row px-4">
                    <StatusBadge status={r.delivery} />
                  </td>
                  <td className="row px-4">{r.replied ? <StatusBadge status="replied" /> : r.unsubscribed ? <StatusBadge status="unsubscribed" /> : <span className="text-muted">No response</span>}</td>
                  <td className="row whitespace-nowrap px-4 text-muted">{r.at ? formatDateTime(r.at) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-6 py-8 text-center text-[13px] text-muted">No recipients have this status.</p>}
      </div>
      <Pagination page={page} total={rows.length} noun="recipients" onPage={setPage} />
    </div>
  )
}

export function EmailsTab({ campaign }: TabProps) {
  return (
    <ol className="flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      {campaign.steps.map((step, i) => (
        <li key={step.id} className="rounded-xl border border-line">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[13px]">
            <span className="font-semibold">{i === 0 ? 'Email 1 — initial message' : `Email ${i + 1} — follow-up`}</span>
            <span className="text-muted">{i === 0 ? 'Sent at the scheduled start' : `Sent ${step.delayDays} days later, only if there is no reply or unsubscribe`}</span>
          </div>
          <div className="flex flex-col gap-3 px-4 py-3 text-sm">
            <p className="font-semibold">{step.subject}</p>
            <RichText source={step.body} />
            <UnsubscribeFooter text={campaign.unsubscribeFooter} />
          </div>
        </li>
      ))}
      <li className="text-xs text-muted">
        Placeholders such as {'{{first_name}}'} and {'{{company}}'} are filled per recipient when sending.
      </li>
    </ol>
  )
}

export function RepliesTab({ campaign }: TabProps) {
  const threads = useData((s) => s.threads)
  const replies = useMemo(() => sortByRecent(threads.filter((t) => t.campaignId === campaign.id && t.folder !== 'trash')), [threads, campaign.id])
  if (replies.length === 0) {
    return <EmptyState icon={MessageSquare} title="No replies yet" body="Conversations started by this campaign will appear here and in Mail." />
  }
  return (
    <ul>
      {replies.map((t) => {
        const last = lastMessage(t)
        return (
          <li key={t.id} className="border-b border-line">
            <Link to={`/mail/${t.folder}/${t.id}`} className="row flex flex-col gap-x-3 px-4 hover:bg-surface-2 md:flex-row md:items-center md:px-6">
              <span className={t.unread ? 'w-44 shrink-0 truncate font-semibold' : 'w-44 shrink-0 truncate'}>
                {t.unread && <span className="sr-only">Unread. </span>}
                {last.from.name}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{plainPreview(last.body)}</span>
              <time dateTime={last.at} className="shrink-0 text-xs text-muted">
                {formatWhen(last.at)}
              </time>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function ActivityTab({ campaign }: TabProps) {
  const events = useData((s) => s.events)
  const { search, setPage } = useTabParams()
  const rows = useMemo(() => events.filter((e) => e.campaignId === campaign.id), [events, campaign.id])
  const page = clampPage(search.get('page'), rows.length)
  if (rows.length === 0) return <EmptyState icon={Info} title="No activity yet" body="Events appear here once the campaign is scheduled or starts sending." />
  return (
    <div className="flex h-full flex-col">
      <ol className="min-h-0 flex-1 overflow-auto">
        {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((e) => (
          <li key={e.id} className="row flex items-center gap-3 border-b border-line px-4 text-[13px] md:px-6">
            <time dateTime={e.at} className="w-36 shrink-0 text-muted">
              {formatDateTime(e.at)}
            </time>
            <span className="w-32 shrink-0 font-medium">{e.kind === 'campaign' ? e.text : EVENT_LABELS[e.kind]}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{e.email}</span>
          </li>
        ))}
      </ol>
      <Pagination page={page} total={rows.length} noun="events" onPage={setPage} />
    </div>
  )
}

export function SettingsTab({ campaign }: TabProps) {
  const identities = useData((s) => s.identities)
  const updateCampaign = useData((s) => s.updateCampaign)
  const [form, setForm] = useState({ identityIds: campaign.identityIds, schedule: campaign.schedule, unsubscribeFooter: campaign.unsubscribeFooter })
  const locked = campaign.status === 'completed'
  const domainIdentities = identities.filter((i) => i.domain === identities.find((x) => x.id === campaign.identityIds[0])?.domain)
  const errors = [
    form.identityIds.length === 0 && 'Select at least one sender identity.',
    form.unsubscribeFooter.trim() === '' && 'Campaign emails must include an unsubscribe footer.',
    sendingWindowError(form.schedule.windowStart, form.schedule.windowEnd),
    dailyLimitError(form.schedule.dailyLimit),
  ].filter((e): e is string => Boolean(e))

  const setSchedule = (patch: Partial<Campaign['schedule']>) => setForm((f) => ({ ...f, schedule: { ...f.schedule, ...patch } }))
  const toggleIdentity = (id: string) => setForm((f) => ({ ...f, identityIds: f.identityIds.includes(id) ? f.identityIds.filter((x) => x !== id) : [...f.identityIds, id] }))

  return (
    <form
      className="flex max-w-2xl flex-col gap-5 p-4 md:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (errors.length > 0) return
        updateCampaign(campaign.id, form)
        toast('Campaign settings saved.', { tone: 'success' })
      }}
    >
      {locked && (
        <Callout tone="info" icon={Info}>
          This campaign is completed, so its settings are read-only.
        </Callout>
      )}
      <fieldset disabled={locked} className="flex flex-col gap-5">
        <fieldset>
          <legend className="text-sm font-semibold">Sender identities</legend>
          <p className="text-[13px] text-muted">Sends rotate across the selected addresses. A campaign stays within one domain.</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {domainIdentities.map((i) => (
              <label key={i.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form.identityIds.includes(i.id)} onChange={() => toggleIdentity(i.id)} />
                {i.id}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">Schedule (simulated)</legend>
          <Field label="Sending window starts">{(p) => <Input {...p} type="time" value={form.schedule.windowStart} onChange={(e) => setSchedule({ windowStart: e.target.value })} />}</Field>
          <Field label="Sending window ends">{(p) => <Input {...p} type="time" value={form.schedule.windowEnd} onChange={(e) => setSchedule({ windowEnd: e.target.value })} />}</Field>
          <Field label="Daily limit per identity" hint="A pacing control, not a deliverability guarantee.">
            {(p) => <Input {...p} type="number" min={1} max={500} value={form.schedule.dailyLimit} onChange={(e) => setSchedule({ dailyLimit: Number(e.target.value) })} />}
          </Field>
          <Field label="Timezone" hint="Set under Settings → Sending and unsubscribe.">{(p) => <Input {...p} value={form.schedule.timezone} readOnly />}</Field>
        </fieldset>
        <Field label="Unsubscribe footer" hint="Appended to every email in this campaign, followed by an unsubscribe link.">
          {(p) => <Textarea {...p} rows={3} value={form.unsubscribeFooter} onChange={(e) => setForm((f) => ({ ...f, unsubscribeFooter: e.target.value }))} />}
        </Field>
        {errors.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-[13px] font-medium text-danger">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div>
          <Button type="submit" variant="primary">
            Save settings
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
