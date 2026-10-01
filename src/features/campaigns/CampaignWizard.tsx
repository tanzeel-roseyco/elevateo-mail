import { Check, ChevronRight, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { gateway } from '@/data/gateway'
import { useData } from '@/data/store'
import { dailyLimitError, isSendable, personalise, validateCampaignName } from '@/domain/rules'
import { DOMAIN_NAMES, type DomainName, FOLLOW_UP_DELAY_MAX_DAYS } from '@/domain/schema'
import { cx } from '@/lib/format'
import { Callout, RichText, UnsubscribeFooter, usePageTitle } from '@/ui/Bits'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { toast } from '@/ui/toast'
import { zonedTimeToIso } from '@/domain/time'

const STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'recipients', label: 'Recipients' },
  { id: 'message', label: 'Message' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'review', label: 'Review' },
] as const
type StepId = (typeof STEPS)[number]['id']

interface Form {
  name: string
  domain: DomainName
  identityIds: string[]
  audience: 'all' | 'tags'
  tags: string[]
  subject: string
  body: string
  followUp: boolean
  followUpDelay: number
  followUpBody: string
  startDate: string
  startTime: string
  dailyLimit: number
}

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

// AIDEV-NOTE: details → recipients → message → schedule → review. The step is in the URL (?step=) so Back works;
// form state is in memory, so a reload restarts the flow (acceptable for a prototype, noted in README).
/** Whole days between 1 and the maximum; a cleared or non-numeric field falls back to 1 rather than NaN. */
function followUpDelayFrom(input: string): number {
  const days = Math.round(Number(input))
  return Number.isFinite(days) ? Math.min(FOLLOW_UP_DELAY_MAX_DAYS, Math.max(1, days)) : 1
}

export function CampaignWizard() {
  usePageTitle('Create campaign')
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const campaigns = useData((s) => s.campaigns)
  const contacts = useData((s) => s.contacts)
  const identities = useData((s) => s.identities)
  const settings = useData((s) => s.settings)
  const [busy, setBusy] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [form, setForm] = useState<Form>(() => ({
    name: '',
    domain: 'boltloop.co',
    identityIds: identities.filter((i) => i.domain === 'boltloop.co').map((i) => i.id),
    audience: 'all',
    tags: [],
    subject: '',
    body: 'Hi {{first_name}},\n\n',
    followUp: false,
    followUpDelay: 4,
    followUpBody: 'Hi {{first_name}},\n\nA quick follow-up on my earlier note.',
    startDate: tomorrow(),
    startTime: settings.windowStart,
    dailyLimit: settings.dailyLimitPerIdentity,
  }))
  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }))

  const allTags = useMemo(() => [...new Set(contacts.flatMap((c) => c.tags))].sort(), [contacts])
  const inAudience = useMemo(() => contacts.filter((c) => form.audience === 'all' || c.tags.some((t) => form.tags.includes(t))), [contacts, form.audience, form.tags])
  const eligible = useMemo(() => inAudience.filter(isSendable), [inAudience])
  const excluded = inAudience.length - eligible.length

  // The date and time are wall-clock values in the sending timezone, not in the browser's own timezone.
  const startAt = zonedTimeToIso(form.startDate, form.startTime, settings.timezone)

  const errors: Record<StepId, string[]> = {
    details: [validateCampaignName(form.name, campaigns), form.identityIds.length === 0 ? 'Select at least one sender identity.' : null].filter((e): e is string => e !== null),
    recipients: eligible.length === 0 ? ['No eligible recipients match. Choose a different audience.'] : [],
    message: [form.subject.trim() === '' ? 'Add a subject line.' : null, form.body.trim().length < 20 ? 'Write the message (at least 20 characters).' : null, form.followUp && form.followUpBody.trim() === '' ? 'Write the follow-up or turn it off.' : null].filter((e): e is string => e !== null),
    schedule: [startAt === null ? 'Choose a valid start date and time.' : null, dailyLimitError(form.dailyLimit)].filter((e): e is string => e !== null),
    review: [],
  }

  // Deep links cannot skip ahead of an incomplete step: show the first step that still has errors.
  const firstInvalid = STEPS.findIndex((s) => errors[s.id].length > 0)
  const maxReachable = firstInvalid === -1 ? STEPS.length - 1 : firstInvalid
  const requested = Math.max(0, STEPS.findIndex((s) => s.id === search.get('step')))
  const index = Math.min(requested, maxReachable)
  const step = STEPS[index]!
  const stepErrors = errors[step.id]

  const go = (i: number) => {
    setShowErrors(false)
    setSearch({ step: STEPS[i]!.id })
  }
  const next = () => (stepErrors.length > 0 ? setShowErrors(true) : go(index + 1))

  const create = async (status: 'draft' | 'scheduled') => {
    // Unreachable through the UI (the schedule step blocks it); guards the type and any future caller.
    if (startAt === null) return
    setBusy(true)
    try {
      const { id } = await gateway.createCampaign({
        name: form.name,
        identityIds: form.identityIds,
        contactIds: eligible.map((c) => c.id),
        steps: [{ subject: form.subject, body: form.body, delayDays: 0 }, ...(form.followUp ? [{ subject: `Re: ${form.subject}`, body: form.followUpBody, delayDays: form.followUpDelay }] : [])],
        schedule: { startAt, timezone: settings.timezone, windowStart: settings.windowStart, windowEnd: settings.windowEnd, dailyLimit: form.dailyLimit },
        unsubscribeFooter: settings.unsubscribeFooter,
        status,
      })
      toast(status === 'scheduled' ? 'Campaign scheduled (simulated).' : 'Campaign saved as draft.', { tone: 'success' })
      navigate(`/campaigns/${id}`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The campaign could not be created.', { tone: 'error' })
      setBusy(false)
    }
  }

  const sample = eligible[0] ?? { name: 'Alex Example', company: 'Example Ltd' }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-4 py-3 md:px-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-muted">
          <Link to="/campaigns" className="underline underline-offset-2 hover:text-fg">
            Campaigns
          </Link>
          <ChevronRight aria-hidden className="size-3.5" />
          <span aria-current="page" className="text-fg">
            Create campaign
          </span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Create campaign</h1>
        <ol aria-label="Steps" className="mt-3 flex flex-wrap gap-x-1 gap-y-2">
          {STEPS.map((s, i) => {
            const done = i < index
            return (
              <li key={s.id} className="flex items-center gap-1">
                <button type="button" disabled={i > maxReachable} aria-current={i === index ? 'step' : undefined} onClick={() => go(i)} className={cx('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] disabled:opacity-50', i === index ? 'bg-accent-soft font-semibold text-accent-text' : 'hover:bg-surface-2')}>
                  <span className={cx('flex size-5 items-center justify-center rounded-full border text-[11px]', done ? 'border-success text-success' : 'border-current')}>{done ? <Check aria-hidden className="size-3" /> : i + 1}</span>
                  {s.label}
                  {done && <span className="sr-only"> (completed)</span>}
                </button>
                {i < STEPS.length - 1 && <ChevronRight aria-hidden className="size-3.5 text-muted" />}
              </li>
            )
          })}
        </ol>
      </header>

      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (step.id === 'review') void create('scheduled')
          else next()
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="flex max-w-2xl flex-col gap-4">
            <h2 className="text-base font-semibold">
              Step {index + 1} of {STEPS.length}: {step.label}
            </h2>

            {step.id === 'details' && (
              <>
                <Field label="Campaign name" hint="Only you see this.">{(p) => <Input {...p} value={form.name} maxLength={120} autoFocus onChange={(e) => patch({ name: e.target.value })} />}</Field>
                <Field label="Sending domain" hint="A campaign sends from one brand only.">
                  {(p) => (
                    <Select {...p} value={form.domain} onChange={(e) => { const domain = e.target.value as DomainName; patch({ domain, identityIds: identities.filter((i) => i.domain === domain).map((i) => i.id) }) }}>
                      {DOMAIN_NAMES.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                <fieldset>
                  <legend className="text-[13px] font-medium">Sender identities</legend>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {identities.filter((i) => i.domain === form.domain).map((i) => (
                      <label key={i.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form.identityIds.includes(i.id)} onChange={() => patch({ identityIds: form.identityIds.includes(i.id) ? form.identityIds.filter((x) => x !== i.id) : [...form.identityIds, i.id] })} />
                        {i.id}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}

            {step.id === 'recipients' && (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-[13px] font-medium">Audience</legend>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="audience" className="size-4 accent-[var(--accent)]" checked={form.audience === 'all'} onChange={() => patch({ audience: 'all' })} />
                    All eligible contacts
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="audience" className="size-4 accent-[var(--accent)]" checked={form.audience === 'tags'} onChange={() => patch({ audience: 'tags' })} />
                    Contacts with any of these tags
                  </label>
                </fieldset>
                {form.audience === 'tags' && (
                  <fieldset className="flex flex-wrap gap-2">
                    <legend className="sr-only">Tags</legend>
                    {allTags.map((t) => (
                      <label key={t} className={cx('cursor-pointer rounded-full border px-3 py-1 text-[13px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-text', form.tags.includes(t) ? 'border-accent-text bg-accent-soft font-semibold text-accent-text' : 'border-line')}>
                        <input type="checkbox" className="sr-only" checked={form.tags.includes(t)} onChange={() => patch({ tags: form.tags.includes(t) ? form.tags.filter((x) => x !== t) : [...form.tags, t] })} />
                        {t}
                      </label>
                    ))}
                  </fieldset>
                )}
                <p aria-live="polite" className="text-sm">
                  <strong className="tabular-nums">{eligible.length}</strong> eligible recipient{eligible.length === 1 ? '' : 's'}
                </p>
                {excluded > 0 && (
                  <Callout tone="warn" icon={Info}>
                    {excluded} contact{excluded === 1 ? ' is' : 's are'} excluded automatically: unsubscribed, bounced, suppressed, or without recorded opt-in consent.
                  </Callout>
                )}
              </>
            )}

            {step.id === 'message' && (
              <>
                <Field label="Subject">{(p) => <Input {...p} value={form.subject} maxLength={200} onChange={(e) => patch({ subject: e.target.value })} />}</Field>
                <Field label="Message" hint="Use {{first_name}} and {{company}} to personalise. **bold**, _italic_, [links](https://…) and “- ” lists are supported.">
                  {(p) => <Textarea {...p} rows={9} value={form.body} onChange={(e) => patch({ body: e.target.value })} />}
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form.followUp} onChange={(e) => patch({ followUp: e.target.checked })} />
                  Send one follow-up if there is no reply
                </label>
                {form.followUp && (
                  <>
                    <Field label="Days to wait before the follow-up" className="max-w-56">
                      {(p) => <Input {...p} type="number" min={1} max={FOLLOW_UP_DELAY_MAX_DAYS} value={form.followUpDelay} onChange={(e) => patch({ followUpDelay: followUpDelayFrom(e.target.value) })} />}
                    </Field>
                    <Field label="Follow-up message">{(p) => <Textarea {...p} rows={5} value={form.followUpBody} onChange={(e) => patch({ followUpBody: e.target.value })} />}</Field>
                  </>
                )}
                <Callout tone="info" icon={Info}>
                  Every campaign email ends with your unsubscribe footer. It cannot be removed.
                </Callout>
              </>
            )}

            {step.id === 'schedule' && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Start date">{(p) => <Input {...p} type="date" value={form.startDate} onChange={(e) => patch({ startDate: e.target.value })} />}</Field>
                  <Field label="Start time" hint={`Timezone: ${settings.timezone}`}>{(p) => <Input {...p} type="time" value={form.startTime} onChange={(e) => patch({ startTime: e.target.value })} />}</Field>
                </div>
                <Field label="Daily limit per sender identity" hint="A pacing control. It does not guarantee deliverability." className="max-w-72">
                  {(p) => <Input {...p} type="number" min={1} max={500} value={form.dailyLimit} onChange={(e) => patch({ dailyLimit: Number(e.target.value) })} />}
                </Field>
                <p className="text-[13px] text-muted">
                  At {form.dailyLimit} per identity across {form.identityIds.length} identities, {eligible.length} recipients take about {Math.max(1, Math.ceil(eligible.length / Math.max(1, form.dailyLimit * form.identityIds.length)))} sending day(s), within {settings.windowStart}–{settings.windowEnd}.
                </p>
              </>
            )}

            {step.id === 'review' && (
              <>
                <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted">Name</dt>
                  <dd className="font-medium">{form.name}</dd>
                  <dt className="text-muted">Senders</dt>
                  <dd>{form.identityIds.join(', ')}</dd>
                  <dt className="text-muted">Recipients</dt>
                  <dd>
                    {eligible.length} eligible{excluded > 0 && `, ${excluded} excluded`}
                  </dd>
                  <dt className="text-muted">Starts</dt>
                  <dd>
                    {form.startDate} at {form.startTime} ({settings.timezone})
                  </dd>
                  <dt className="text-muted">Emails</dt>
                  <dd>{form.followUp ? `Initial message + follow-up after ${form.followUpDelay} days` : 'One message, no follow-up'}</dd>
                </dl>
                <section aria-label="Message preview" className="rounded-xl border border-line">
                  <p className="border-b border-line bg-surface-2 px-4 py-2 text-xs text-muted">Preview for {sample.name}</p>
                  <div className="flex flex-col gap-3 px-4 py-3 text-sm">
                    <p className="font-semibold">{personalise(form.subject, sample)}</p>
                    <RichText source={personalise(form.body, sample)} />
                    <UnsubscribeFooter text={settings.unsubscribeFooter} />
                  </div>
                </section>
                <Callout tone="info" icon={Info}>
                  Scheduling is a simulation. No email will be sent from this prototype.
                </Callout>
              </>
            )}

            {showErrors && stepErrors.length > 0 && (
              <ul role="alert" className="list-disc pl-5 text-[13px] font-medium text-danger">
                {stepErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-4 py-3 md:px-6">
          <Button disabled={index === 0} onClick={() => go(index - 1)}>
            Back
          </Button>
          {step.id === 'review' ? (
            <>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Creating…' : 'Schedule campaign (simulated)'}
              </Button>
              <Button disabled={busy} onClick={() => void create('draft')}>
                Save as draft
              </Button>
            </>
          ) : (
            <Button type="submit" variant="primary">
              Continue
            </Button>
          )}
          <Link to="/campaigns" className="ml-auto text-[13px] text-muted underline underline-offset-2">
            Cancel
          </Link>
        </footer>
      </form>
    </div>
  )
}
