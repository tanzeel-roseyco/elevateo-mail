import { AlertTriangle, ArrowLeft, Info, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { isServerId, type SavedSend } from '@/data/http/contract'
import { live, useLive } from '@/data/http/instance'
import type { ReplaceTarget } from '@/data/http/live'
import { canReplace, checkSendContent, recipientCount, type SendContent } from '@/domain/sendLifecycle'
import { Callout, EmptyState, PageHeader, Skeleton, usePageTitle } from '@/ui/Bits'
import { Button, buttonClass } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { toast } from '@/ui/toast'
import { QuotaLine } from './QuotaLine'
import { SendPreview } from './SendPreview'

// Reply hands over two ids through router state (history keeps that state, so it carries no address or subject).
// It is untrusted like any other input, so it is parsed; the message itself is read through the store.
const prefillSchema = z.object({ mailboxId: z.string().refine(isServerId), replyTo: z.string().refine(isServerId) }).partial()

const split = (value: string): string[] => value.split(/[,;\s]+/).filter(Boolean)
const join = (list: string[]): string => list.join(', ')

interface FormState {
  replyToMessageId?: string
  mailboxId: string
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
}
const toContent = (form: FormState): SendContent => ({ mailboxId: form.mailboxId, to: split(form.to), cc: split(form.cc), bcc: split(form.bcc), subject: form.subject, body: form.body, ...(form.replyToMessageId ? { replyToMessageId: form.replyToMessageId } : {}) })

function ComposeForm({ initial, replaces }: { initial: FormState; replaces: ReplaceTarget | null }) {
  const navigate = useNavigate()
  const mailboxes = useLive((s) => s.mailboxes)
  const senders = mailboxes.filter((m) => m.connected && m.sendEnabled)
  // What is typed here lives only in this page's memory until it is submitted; the browser stores none of it.
  const [form, setForm] = useState<FormState>(initial)
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [submitting, setSubmitting] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const check = checkSendContent(toContent(form))
  const errorFor = (field: keyof SendContent): string | null => (showErrors && !check.ok ? (check.errors.find((e) => e.field === field)?.message ?? null) : null)
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  const review = () => {
    setShowErrors(true)
    setRefusal(null)
    if (check.ok) setStep('review')
  }
  const submit = () => {
    if (!check.ok) return
    setSubmitting(true)
    setRefusal(null)
    void live
      .submit(check.content, replaces)
      .then((result) => {
        if (result.outcome === 'refused') return setRefusal(result.message)
        // No answer came back: the Send requests page shows it as unconfirmed and looks the same request up.
        if (result.outcome === 'unconfirmed') return void navigate('/sends')
        if (result.converged) toast('This request had already been replaced elsewhere. This is that replacement; a second one was not created.')
        void navigate(`/sends/${result.id}`)
      })
      .finally(() => setSubmitting(false))
  }

  if (step === 'review' && check.ok) {
    const sender = mailboxes.find((m) => m.id === check.content.mailboxId)
    return (
      <>
        <PageHeader
          title={replaces ? 'Review the replacement' : 'Review before submitting'}
          description={replaces ? 'Submitting cancels the earlier version and saves this one in a single step. Nothing is sent: the new version needs your approval.' : 'This is exactly what will be saved. Submitting does not send it: you approve it on the next screen.'}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex max-w-3xl flex-col gap-4 p-4 md:p-6">
            {refusal && (
              <Callout tone="warn" icon={AlertTriangle}>
                {refusal}
              </Callout>
            )}
            <SendPreview content={check.content} from={sender?.address ?? 'unknown mailbox'} />
            <p className="text-[13px] text-muted">
              Counts as {recipientCount(check.content)} against the mailbox's limit once approved. <QuotaLine mailboxId={check.content.mailboxId} />
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={submitting} onClick={submit} icon={<Send aria-hidden className="size-4" />}>
                {submitting ? 'Submitting…' : replaces ? 'Replace and submit for approval' : 'Submit for approval'}
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
      <PageHeader title={replaces ? 'Edit as a replacement' : 'Compose'} description="Plain text only. Attachments and formatting are not available yet." />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            review()
          }}
          className="flex max-w-3xl flex-col gap-3 p-4 md:p-6"
        >
          {form.replyToMessageId && <Callout tone="info" icon={Info}>Replying in the original Gmail conversation. Sender, recipients and subject stay fixed to preserve threading. <Button onClick={() => set({ replyToMessageId: undefined })}>Start a new conversation</Button></Callout>}
          <Field label="From" error={errorFor('mailboxId')}>
            {(p) => (
              <Select {...p} disabled={!!form.replyToMessageId} value={form.mailboxId} onChange={(e) => set({ mailboxId: e.target.value })}>
                {senders.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.address}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="To" error={errorFor('to')} hint="Separate addresses with commas. Up to 30 recipients across To, CC and BCC.">
            {(p) => <Input {...p} type="text" inputMode="email" autoComplete="off" disabled={!!form.replyToMessageId} value={form.to} onChange={(e) => set({ to: e.target.value })} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CC" error={errorFor('cc')}>
              {(p) => <Input {...p} type="text" inputMode="email" autoComplete="off" disabled={!!form.replyToMessageId} value={form.cc} onChange={(e) => set({ cc: e.target.value })} />}
            </Field>
            <Field label="BCC" error={errorFor('bcc')}>
              {(p) => <Input {...p} type="text" inputMode="email" autoComplete="off" disabled={!!form.replyToMessageId} value={form.bcc} onChange={(e) => set({ bcc: e.target.value })} />}
            </Field>
          </div>
          <Field label="Subject" error={errorFor('subject')}>
            {(p) => <Input {...p} type="text" maxLength={998} disabled={!!form.replyToMessageId} value={form.subject} onChange={(e) => set({ subject: e.target.value })} />}
          </Field>
          <Field label="Message" error={errorFor('body')}>
            {(p) => <Textarea {...p} rows={12} maxLength={100000} value={form.body} onChange={(e) => set({ body: e.target.value })} />}
          </Field>
          <Callout tone="info" icon={Info}>
            Nothing is sent from this screen, and what you type is not stored in this browser: leaving before you submit discards it. After review you submit the exact version to the server; it is sent only after you approve that version, and only if the mailbox still has capacity.
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

const fromSaved = (saved: SavedSend, senderIds: string[]): FormState => ({
  // AIDEV-NOTE: Threaded replies never move to another mailbox; the page gates unavailable reply senders.
  replyToMessageId: saved.replyToMessageId,
  mailboxId: saved.replyToMessageId || senderIds.includes(saved.summary.mailboxId) ? saved.summary.mailboxId : (senderIds[0] ?? ''),
  to: join(saved.to),
  cc: join(saved.cc),
  bcc: join(saved.bcc),
  subject: saved.subject,
  body: saved.body,
})

// AIDEV-NOTE: Write → review → submit for approval. Submitting saves an immutable version on the server and sends
// nothing; approval happens on the request's own page. `?replace=<id>` edits a saved request by replacing it: the
// server cancels the old version and saves one successor atomically, so two tabs cannot both create one.
export function ComposePage() {
  usePageTitle('Compose')
  const location = useLocation()
  const [params] = useSearchParams()
  const replaceParam = params.get('replace')
  const replaceId = replaceParam && isServerId(replaceParam) ? replaceParam : null
  const detail = useLive((s) => (replaceId ? s.details.find((d) => d.id === replaceId) : undefined))
  const mailboxes = useLive((s) => s.mailboxes)
  const senderIds = mailboxes.filter((m) => m.connected && m.sendEnabled).map((m) => m.id)
  useEffect(() => {
    if (replaceId) void live.openRequest(replaceId)
  }, [replaceId])
  const prefill = prefillSchema.safeParse(location.state)
  const given = prefill.success ? prefill.data : {}
  const replyKey = !replaceId && given.mailboxId && given.replyTo ? `${given.mailboxId}/${given.replyTo}` : null
  const original = useLive((s) => (replyKey ? s.bodies.find((b) => b.key === replyKey)?.body : undefined))
  useEffect(() => {
    const [mailboxId, messageId] = replyKey?.split('/') ?? []
    if (mailboxId && messageId) void live.openBody(mailboxId, messageId)
  }, [replyKey])

  if (senderIds.length === 0) return <EmptyState icon={Info} title="No mailbox can send" body="None of your connected mailboxes is allowed to send. Sending permission is set per mailbox in Connections." action={<Link to="/connections/mailboxes" className={buttonClass('primary')}>Open Connections</Link>} />

  if (!replaceId) {
    if (replyKey && (!original || original.status === 'loading' || original.status === 'idle')) return <Skeleton rows={8} />
    const source = original?.status === 'ready' ? original.data : null
    const replyMailbox = mailboxes.find((m) => m.id === given.mailboxId)
    // AIDEV-NOTE: Never silently convert a failed or foreign reply into ordinary mail or change its sending mailbox.
    if (replyKey && (!source || source.id !== given.replyTo || source.mailboxId !== given.mailboxId || source.incomplete || replyMailbox?.provider !== 'gmail' || !senderIds.includes(given.mailboxId ?? ''))) return <EmptyState icon={AlertTriangle} title="This message cannot be replied to" body="A complete message from a Gmail mailbox with sending enabled is required. Open the original message again after reconnecting or synchronising." action={<Button onClick={() => { if (given.mailboxId && given.replyTo) void live.openBody(given.mailboxId, given.replyTo) }}>Try again</Button>} />
    const mailboxId = given.mailboxId && senderIds.includes(given.mailboxId) ? given.mailboxId : (senderIds[0] ?? '')
    return <ComposeForm key={`${replyKey ?? 'new'}:${source ? 'ready' : 'blank'}`} initial={{ mailboxId, to: source?.sender ?? '', cc: '', bcc: '', subject: source?.subject ?? '', body: '', ...(source ? { replyToMessageId: source.id } : {}) }} replaces={null} />
  }

  const saved = detail?.saved
  if (!saved || saved.status === 'loading' || saved.status === 'idle') return <Skeleton rows={8} />
  if (saved.status === 'error') return <EmptyState icon={AlertTriangle} title="The request to edit could not be loaded" body={saved.message} action={<Button variant="primary" onClick={() => void live.openRequest(replaceId)}>Try again</Button>} />
  const openRequest = (
    <Link to={`/sends/${detail?.successorId ?? replaceId}`} className={buttonClass('primary')}>
      {detail?.successorId ? 'Open the replacement' : 'Open request'}
    </Link>
  )
  if (detail?.successorId) return <EmptyState icon={Info} title="This request has already been replaced" body="A request has one replacement. Open it to review, approve or edit it." action={openRequest} />
  if (!detail?.status || !detail.revision || !canReplace(detail.status) || saved.data.kind !== 'manual') return <EmptyState icon={Info} title="This request can no longer be changed" body="It is being sent, was accepted, or its outcome is unknown, so it cannot be replaced." action={openRequest} />
  if (saved.data.replyToMessageId && !senderIds.includes(saved.data.summary.mailboxId)) return <EmptyState icon={Info} title="The reply mailbox cannot send" body="Reconnect and enable the original mailbox before editing this reply." action={openRequest} />
  // Keyed by the saved version, so the form starts from exactly what the server holds.
  return <ComposeForm key={`${replaceId}:${detail.revision}`} initial={fromSaved(saved.data, senderIds)} replaces={{ id: replaceId, revision: detail.revision }} />
}
