import { ArrowLeft, Info, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { live, useLive } from '@/data/http/instance'
import { checkSendContent, recipientCount, type SendContent } from '@/domain/sendLifecycle'
import { Callout, EmptyState, PageHeader, usePageTitle } from '@/ui/Bits'
import { Button, buttonClass } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { QuotaLine } from './QuotaLine'
import { SendPreview } from './SendPreview'

// Reply hands over a recipient and subject through router state: untrusted like any other input, so it is parsed.
const prefillSchema = z.object({ mailboxId: z.string(), to: z.string(), subject: z.string() }).partial()

const split = (value: string): string[] => value.split(/[,;\s]+/).filter(Boolean)
const join = (list: string[]): string => list.join(', ')

interface FormState {
  mailboxId: string
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
}
const toContent = (form: FormState): SendContent => ({ mailboxId: form.mailboxId, to: split(form.to), cc: split(form.cc), bcc: split(form.bcc), subject: form.subject, body: form.body })

// AIDEV-NOTE: Write → review → submit for approval. Submitting saves an immutable version on the server and sends
// nothing; approval happens on the request's own page. Only an unsubmitted draft can be edited here.
export function ComposePage() {
  usePageTitle('Compose')
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const draftKey = params.get('draft')
  const record = useLive((s) => (draftKey ? s.sends.find((r) => r.key === draftKey) : undefined))
  const mailboxes = useLive((s) => s.mailboxes)
  const senders = mailboxes.filter((m) => m.connected && m.sendEnabled)

  const [form, setForm] = useState<FormState>(() => {
    // A draft written for a mailbox that may no longer send falls back to one that can, visibly, in the From field.
    if (record) return { mailboxId: senders.some((m) => m.id === record.content.mailboxId) ? record.content.mailboxId : (senders[0]?.id ?? ''), to: join(record.content.to), cc: join(record.content.cc), bcc: join(record.content.bcc), subject: record.content.subject, body: record.content.body }
    const prefill = prefillSchema.safeParse(location.state)
    const given = prefill.success ? prefill.data : {}
    const mailboxId = senders.some((m) => m.id === given.mailboxId) ? given.mailboxId! : (senders[0]?.id ?? '')
    return { mailboxId, to: given.to ?? '', cc: '', bcc: '', subject: given.subject ?? '', body: '' }
  })
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [submitting, setSubmitting] = useState(false)
  const check = checkSendContent(toContent(form))
  const [showErrors, setShowErrors] = useState(false)
  const errorFor = (field: keyof SendContent): string | null => (showErrors && !check.ok ? (check.errors.find((e) => e.field === field)?.message ?? null) : null)

  // The draft is saved in this browser as fields are left, so an unfinished message survives a reload.
  const save = (content: SendContent): string => {
    const key = live.saveDraft(draftKey, content)
    if (key !== draftKey) setParams({ draft: key }, { replace: true })
    return key
  }
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))
  const saveOnBlur = () => {
    if (form.to || form.subject || form.body) save(toContent(form))
  }

  if (draftKey && record && record.status !== 'local_draft') {
    return (
      <EmptyState
        icon={Info}
        title="This request has already been submitted"
        body="A submitted version cannot be changed. Open the request to approve it, or to cancel it and edit a copy."
        action={
          <Link to={`/sends/${record.key}`} className={buttonClass('primary')}>
            Open request
          </Link>
        }
      />
    )
  }
  if (senders.length === 0) return <EmptyState icon={Info} title="No mailbox can send" body="None of your connected mailboxes is allowed to send. Sending permission is set per mailbox in Connections." action={<Link to="/connections/mailboxes" className={buttonClass('primary')}>Open Connections</Link>} />

  const review = () => {
    setShowErrors(true)
    if (!check.ok) return
    save(check.content)
    setStep('review')
  }
  const submit = () => {
    if (!check.ok) return
    setSubmitting(true)
    const key = save(check.content)
    // Whatever the answer (saved, refused, or no answer at all), the request's own page shows the true state.
    void live.submit(key).finally(() => void navigate(`/sends/${key}`))
  }

  if (step === 'review' && check.ok) {
    const sender = mailboxes.find((m) => m.id === check.content.mailboxId)
    return (
      <>
        <PageHeader title="Review before submitting" description="This is exactly what will be saved. Submitting does not send it: you approve it on the next screen." />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex max-w-3xl flex-col gap-4 p-4 md:p-6">
            <SendPreview content={check.content} from={sender?.address ?? 'unknown mailbox'} />
            <p className="text-[13px] text-muted">
              Counts as {recipientCount(check.content)} against the mailbox's limit once approved. <QuotaLine mailboxId={check.content.mailboxId} />
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={submitting} onClick={submit} icon={<Send aria-hidden className="size-4" />}>
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </Button>
              <Button disabled={submitting} onClick={() => setStep('edit')} icon={<ArrowLeft aria-hidden className="size-4" />}>
                Back to editing
              </Button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Compose" description="Plain text only. Attachments and formatting are not available yet." />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            review()
          }}
          onBlur={saveOnBlur}
          className="flex max-w-3xl flex-col gap-3 p-4 md:p-6"
        >
          <Field label="From" error={errorFor('mailboxId')}>
            {(p) => (
              <Select {...p} value={form.mailboxId} onChange={(e) => set({ mailboxId: e.target.value })}>
                {senders.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.address}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="To" error={errorFor('to')} hint="Separate addresses with commas. Up to 30 recipients across To, CC and BCC.">
            {(p) => <Input {...p} type="text" inputMode="email" autoComplete="off" value={form.to} onChange={(e) => set({ to: e.target.value })} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CC" error={errorFor('cc')}>
              {(p) => <Input {...p} type="text" inputMode="email" autoComplete="off" value={form.cc} onChange={(e) => set({ cc: e.target.value })} />}
            </Field>
            <Field label="BCC" error={errorFor('bcc')}>
              {(p) => <Input {...p} type="text" inputMode="email" autoComplete="off" value={form.bcc} onChange={(e) => set({ bcc: e.target.value })} />}
            </Field>
          </div>
          <Field label="Subject" error={errorFor('subject')}>
            {(p) => <Input {...p} type="text" maxLength={998} value={form.subject} onChange={(e) => set({ subject: e.target.value })} />}
          </Field>
          <Field label="Message" error={errorFor('body')}>
            {(p) => <Textarea {...p} rows={12} value={form.body} onChange={(e) => set({ body: e.target.value })} />}
          </Field>
          <Callout tone="info" icon={Info}>
            Nothing is sent from this screen. After review you submit the exact version to the server; it is sent only after you approve that version, and only if the mailbox still has capacity.
          </Callout>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary">
              Review
            </Button>
            <Link to="/sends" className={buttonClass('ghost')}>
              Send requests
            </Link>
          </div>
        </form>
      </div>
    </>
  )
}
