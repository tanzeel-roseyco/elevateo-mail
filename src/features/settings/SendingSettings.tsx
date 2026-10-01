import { Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useData } from '@/data/store'
import { dailyLimitError, sendBlockReason, sendingWindowError } from '@/domain/rules'
import { StatusBadge } from '@/ui/Badge'
import { Callout, UnsubscribeFooter } from '@/ui/Bits'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { toast } from '@/ui/toast'

export const TIMEZONES = ['Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney']

export function SendingSettings() {
  const settings = useData((s) => s.settings)
  const contacts = useData((s) => s.contacts)
  const updateSettings = useData((s) => s.updateSettings)
  const [form, setForm] = useState({ timezone: settings.timezone, windowStart: settings.windowStart, windowEnd: settings.windowEnd, dailyLimitPerIdentity: settings.dailyLimitPerIdentity, unsubscribeFooter: settings.unsubscribeFooter })
  const [submitted, setSubmitted] = useState(false)
  const suppressed = useMemo(() => contacts.filter((c) => sendBlockReason(c) !== null), [contacts])

  const errors = {
    window: sendingWindowError(form.windowStart, form.windowEnd),
    limit: dailyLimitError(form.dailyLimitPerIdentity),
    footer: form.unsubscribeFooter.trim() === '' ? 'Campaign emails must include an unsubscribe footer.' : null,
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const show = <K extends keyof typeof errors>(key: K) => (submitted ? errors[key] : null)

  return (
    <div className="mt-4 flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(true)
          if (hasErrors) return
          updateSettings(form)
          toast('Sending settings saved.', { tone: 'success' })
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Default timezone">
            {(p) => (
              <Select {...p} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {TIMEZONES.map((tz) => (
                  <option key={tz}>{tz}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Sending window starts">{(p) => <Input {...p} type="time" value={form.windowStart} onChange={(e) => setForm({ ...form, windowStart: e.target.value })} />}</Field>
          <Field label="Sending window ends" error={show('window')}>{(p) => <Input {...p} type="time" value={form.windowEnd} onChange={(e) => setForm({ ...form, windowEnd: e.target.value })} />}</Field>
        </div>
        <Field label="Daily sending limit per identity" error={show('limit')} hint="Paces campaign sends. Limits help you send steadily; they do not guarantee deliverability." className="max-w-sm">
          {(p) => <Input {...p} type="number" min={1} max={500} value={form.dailyLimitPerIdentity} onChange={(e) => setForm({ ...form, dailyLimitPerIdentity: Number(e.target.value) })} />}
        </Field>
        <Field label="Default unsubscribe footer" error={show('footer')} hint="Used for new campaigns and campaign-linked messages. An unsubscribe link is always added after it.">
          {(p) => <Textarea {...p} rows={3} maxLength={500} value={form.unsubscribeFooter} onChange={(e) => setForm({ ...form, unsubscribeFooter: e.target.value })} />}
        </Field>
        <div className="rounded-lg border border-line p-3">
          <p className="mb-1.5 text-xs text-muted">Footer preview</p>
          <UnsubscribeFooter text={form.unsubscribeFooter} />
        </div>
        <div>
          <Button type="submit" variant="primary">
            Save sending settings
          </Button>
        </div>
      </form>

      <section aria-labelledby="suppression" className="flex flex-col gap-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="suppression" className="text-base font-semibold">
            Suppression list ({suppressed.length})
          </h3>
          <Link to="/contacts?status=blocked" className="text-[13px] font-medium text-accent-text underline underline-offset-2">
            Open in Contacts
          </Link>
        </div>
        <Callout tone="info" icon={Info}>
          These contacts are never included in campaign sends: unsubscribed, bounced, manually suppressed, or missing opt-in consent.
        </Callout>
        {suppressed.length === 0 ? (
          <p className="text-[13px] text-muted">No contacts are suppressed.</p>
        ) : (
          <ul className="rounded-xl border border-line">
            {suppressed.slice(0, 12).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
                <Link to={`/contacts?contact=${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <span className="min-w-0 flex-1 truncate text-muted">{c.email}</span>
                <StatusBadge status={c.subscription === 'subscribed' ? c.consent : c.subscription} />
              </li>
            ))}
          </ul>
        )}
        {suppressed.length > 12 && <p className="text-xs text-muted">Showing 12 of {suppressed.length}. Open in Contacts to see them all.</p>}
      </section>
    </div>
  )
}
