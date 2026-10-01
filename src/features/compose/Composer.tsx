import { AlertTriangle, Bold, Check, FileText, Italic, Link as LinkIcon, List, Loader2, Maximize2, Minimize2, Minus, Paperclip, Send, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { gateway } from '@/data/gateway'
import { useData } from '@/data/store'
import { identityDomain } from '@/domain/identities'
import { validateSend, type SendCheck } from '@/domain/rules'
import { DOMAIN_NAMES, type Attachment, type Draft } from '@/domain/schema'
import { cx, formatBytes, formatWhen, uid } from '@/lib/format'
import { BrandBanner, UnsubscribeFooter } from '@/ui/Bits'
import { Button, IconButton } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { toast } from '@/ui/toast'
import { useComposer } from './composerStore'
import { RecipientInput } from './RecipientInput'
import { useMediaQuery } from '@/app/appearance'

const AUTOSAVE_MS = 700
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

const hasContent = (d: Draft) => d.to.length + d.cc.length + d.bcc.length + d.attachments.length > 0 || d.subject.trim() !== '' || d.body.trim() !== ''

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string }

// AIDEV-NOTE: Floating composer. Edits autosave to Drafts; closing keeps the draft, only Discard deletes it.
export function Composer({ initial }: { initial: Draft }) {
  const [draft, setDraft] = useState(initial)
  const [showCc, setShowCc] = useState(initial.cc.length + initial.bcc.length > 0)
  const [check, setCheck] = useState<SendCheck | null>(null)
  const [sending, setSending] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const mode = useComposer((s) => s.mode)
  const setMode = useComposer((s) => s.setMode)
  const close = useComposer((s) => s.close)
  const identities = useData((s) => s.identities)
  const domains = useData((s) => s.domains)
  const contacts = useData((s) => s.contacts)
  const campaigns = useData((s) => s.campaigns)
  const defaultFooter = useData((s) => s.settings.unsubscribeFooter)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Captured during the first render, before autoFocus moves focus into the composer, to hand focus back on close.
  const [opener] = useState(() => document.activeElement)
  const desktop = useMediaQuery('(min-width: 768px)')

  // Tracks the newest edit for the unmount flush below. `settled` means sent or discarded: nothing left to save.
  const latest = useRef({ draft: initial, dirty: false, settled: false })

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch }
    latest.current = { ...latest.current, draft: next, dirty: true }
    setDraft(next)
    setCheck(null)
    setSaveState({ kind: 'saving' })
  }

  useEffect(() => {
    if (!latest.current.dirty) return
    const timer = setTimeout(() => {
      // A send or discard in progress owns the draft's fate; saving now would resurrect it afterwards.
      if (latest.current.settled) return
      const now = new Date().toISOString()
      latest.current.dirty = false
      if (hasContent(draft)) {
        useData.getState().upsertDraft({ ...draft, updatedAt: now })
        setSaveState({ kind: 'saved', at: now })
      } else {
        // Everything was cleared again: an empty message is not worth keeping in Drafts.
        useData.getState().deleteDraft(draft.id)
        setSaveState({ kind: 'idle' })
      }
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [draft])

  // Flush on unmount so closing (or opening another message) inside the debounce window never loses text.
  useEffect(
    () => () => {
      const { draft: last, dirty, settled } = latest.current
      if (dirty && !settled && hasContent(last)) useData.getState().upsertDraft({ ...last, updatedAt: new Date().toISOString() })
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    },
    // `opener` is captured once and never changes, so this still runs only on unmount.
    [opener],
  )

  const identity = identities.find((i) => i.id === draft.identityId)
  const domain = identityDomain(draft.identityId)
  const domainInfo = domains.find((d) => d.domain === domain)
  const campaign = campaigns.find((c) => c.id === draft.campaignId)
  const liveWarnings = useMemo(() => validateSend(draft, contacts, identities).warnings, [draft, contacts, identities])

  const wrapSelection = (before: string, after: string, placeholder: string) => {
    const el = bodyRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const selected = draft.body.slice(start, end) || placeholder
    update({ body: draft.body.slice(0, start) + before + selected + after + draft.body.slice(end) })
    // Restore the selection after React re-renders the textarea value.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const accepted: Attachment[] = []
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) toast(`${file.name} is larger than 25 MB and was not attached.`, { tone: 'error' })
      // Only the name and size are kept: the prototype never reads or uploads file contents.
      else accepted.push({ id: uid('a'), name: file.name, sizeBytes: file.size })
    }
    if (accepted.length > 0) update({ attachments: [...draft.attachments, ...accepted] })
  }

  const send = async () => {
    const result = validateSend(draft, contacts, identities)
    setCheck(result)
    if (!result.ok) return
    setSending(true)
    latest.current.settled = true
    try {
      await gateway.sendMessage(draft)
      toast('Simulated send complete. No real email was sent.', { tone: 'success' })
      close()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The simulated send failed.', { tone: 'error' })
      // Keep the message as a draft so nothing typed is lost after a failed send. The newest text is saved,
      // not the copy that was submitted: the fields stay editable while the send is in flight.
      latest.current.settled = false
      latest.current.dirty = false
      useData.getState().upsertDraft({ ...latest.current.draft, updatedAt: new Date().toISOString() })
      setSending(false)
    }
  }

  const discard = async () => {
    if (hasContent(draft) && !(await confirm({ title: 'Discard this draft?', body: 'The message and its attachments will be deleted. This cannot be undone.', confirmLabel: 'Discard draft', danger: true }))) return
    latest.current.settled = true
    useData.getState().deleteDraft(draft.id)
    close()
  }

  const saveAndClose = () => {
    // Saved explicitly: a prefilled reply that was never edited is not "dirty", yet closing must still keep it.
    if (hasContent(draft)) {
      useData.getState().upsertDraft({ ...draft, updatedAt: new Date().toISOString() })
      latest.current.dirty = false
      toast('Draft saved.')
    }
    close()
  }

  const title = draft.subject.trim() || (draft.threadId ? 'Reply' : 'New message')
  const minimised = mode === 'minimised'
  const expanded = mode === 'expanded'
  // Full-screen (expanded, or any size on a phone) covers the page and behaves as a modal dialog;
  // the small floating window deliberately leaves the mail behind it usable, as in Gmail.
  const modal = !minimised && (expanded || !desktop)

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && !sending) {
      e.stopPropagation()
      saveAndClose()
      return
    }
    if (e.key !== 'Tab' || !modal) return
    const focusable = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([hidden]), select:not([disabled]), textarea:not([disabled])')]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      {expanded && <div aria-hidden className="fixed inset-0 z-40 hidden bg-black/40 md:block" />}
      <section
        role="dialog"
        aria-modal={modal || undefined}
        aria-label={`Compose: ${title}`}
        onKeyDown={onKeyDown}
        className={cx(
          'fixed z-40 flex flex-col overflow-hidden border-line bg-surface text-fg shadow-2xl',
          minimised
            ? 'bottom-0 right-0 w-full border-t md:right-6 md:w-80 md:rounded-t-xl md:border md:border-b-0'
            : expanded
              ? 'inset-0 md:inset-8 md:rounded-xl md:border'
              : 'inset-0 md:inset-auto md:bottom-0 md:right-6 md:h-[min(640px,calc(100dvh-5rem))] md:w-[560px] md:rounded-t-xl md:border md:border-b-0',
        )}
      >
        <header className="flex h-11 shrink-0 items-center gap-1 bg-surface-2 pl-4 pr-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
          <p aria-live="polite" className="flex shrink-0 items-center gap-1 pr-1 text-xs text-muted">
            {saveState.kind === 'saving' && 'Saving…'}
            {saveState.kind === 'saved' && (
              <>
                <Check aria-hidden className="size-3.5" />
                Draft saved {formatWhen(saveState.at)}
              </>
            )}
          </p>
          <IconButton label={minimised ? 'Restore composer' : 'Minimise composer'} onClick={() => setMode(minimised ? 'normal' : 'minimised')}>
            <Minus aria-hidden className="size-4" />
          </IconButton>
          <IconButton label={expanded ? 'Exit full screen' : 'Expand composer'} className="hidden md:inline-flex" onClick={() => setMode(expanded ? 'normal' : 'expanded')}>
            {expanded ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
          </IconButton>
          <IconButton label="Save draft and close" disabled={sending} onClick={saveAndClose}>
            <X aria-hidden className="size-4" />
          </IconButton>
        </header>

        {!minimised && (
          <form
            className="flex min-h-0 flex-1 flex-col"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
              <label htmlFor="composer-from" className="w-12 shrink-0 text-[13px] text-muted">
                From
              </label>
              <select
                id="composer-from"
                value={draft.identityId}
                // Switching sender also resets the banner to that identity's default, so one brand's banner never follows another.
                onChange={(e) => update({ identityId: e.target.value, banner: identities.find((i) => i.id === e.target.value)?.banner ?? false })}
                className="h-8 min-w-0 flex-1 rounded-md bg-transparent text-sm"
              >
                {DOMAIN_NAMES.map((d) => (
                  <optgroup key={d} label={d}>
                    {identities.filter((i) => i.domain === d).map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.displayName} &lt;{i.id}&gt;
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {!showCc && (
                <button type="button" className="shrink-0 rounded px-1 text-[13px] text-accent-text underline" onClick={() => setShowCc(true)}>
                  Cc/Bcc
                </button>
              )}
            </div>
            <RecipientInput label="To" value={draft.to} onChange={(to) => update({ to })} contacts={contacts} autoFocus={draft.to.length === 0} />
            {showCc && (
              <>
                <RecipientInput label="Cc" value={draft.cc} onChange={(cc) => update({ cc })} contacts={contacts} />
                <RecipientInput label="Bcc" value={draft.bcc} onChange={(bcc) => update({ bcc })} contacts={contacts} />
              </>
            )}
            <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
              <label htmlFor="composer-subject" className="w-12 shrink-0 text-[13px] text-muted">
                Subject
              </label>
              <input id="composer-subject" value={draft.subject} onChange={(e) => update({ subject: e.target.value })} maxLength={200} className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <textarea
                ref={bodyRef}
                aria-label="Message body"
                value={draft.body}
                onChange={(e) => update({ body: e.target.value })}
                autoFocus={draft.to.length > 0}
                placeholder="Write your message…"
                className="min-h-36 flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none"
              />

              {draft.attachments.length > 0 && (
                <ul aria-label="Attachments" className="flex flex-wrap gap-2 px-4 pb-3">
                  {draft.attachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 py-1 pl-2.5 pr-1 text-[13px]">
                      <FileText aria-hidden className="size-4 text-muted" />
                      <span className="max-w-48 truncate font-medium">{a.name}</span>
                      <span className="text-muted">{formatBytes(a.sizeBytes)}</span>
                      <IconButton label={`Remove ${a.name}`} className="size-6" onClick={() => update({ attachments: draft.attachments.filter((x) => x.id !== a.id) })}>
                        <X aria-hidden className="size-3.5" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}

              {/* What recipients would see appended to the message. */}
              <div className="flex flex-col gap-2.5 border-t border-dashed border-line px-4 py-3">
                {identity?.signature ? <p className="whitespace-pre-line text-[13px] text-muted">{identity.signature}</p> : <p className="text-xs text-muted">No signature set for this sender.</p>}
                {draft.banner && domain && <BrandBanner domain={domain} text={domainInfo?.bannerText} />}
                {draft.campaignId && <UnsubscribeFooter text={campaign?.unsubscribeFooter ?? defaultFooter} />}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2 text-[13px]">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={draft.banner} onChange={(e) => update({ banner: e.target.checked })} />
                  Include {domainInfo?.brand ?? 'brand'} banner
                </label>
                <label className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">Campaign</span>
                  <select aria-label="Link to campaign" value={draft.campaignId ?? ''} onChange={(e) => update({ campaignId: e.target.value || null })} className="h-7 min-w-0 max-w-52 rounded-md border border-line bg-surface px-1.5">
                    <option value="">None (ordinary message)</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {(check && !check.ok) || liveWarnings.length > 0 ? (
              <div className="shrink-0 border-t border-line px-4 py-2 text-[13px]">
                {check && !check.ok && (
                  <ul role="alert" aria-label="Fix before sending" className="flex flex-col gap-0.5 font-medium text-danger">
                    {check.errors.map((e) => (
                      <li key={e.message} className="flex items-start gap-1.5">
                        <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                        {e.message}
                      </li>
                    ))}
                  </ul>
                )}
                {liveWarnings.map((w) => (
                  <p key={w} className="flex items-start gap-1.5 text-warn">
                    <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            ) : null}

            <footer className="flex shrink-0 items-center gap-1 border-t border-line px-3 py-2">
              <Button type="submit" variant="primary" disabled={sending} icon={sending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}>
                {sending ? 'Simulating…' : 'Simulate send'}
              </Button>
              <div role="toolbar" aria-label="Formatting" className="ml-1 flex items-center">
                <IconButton label="Bold" onClick={() => wrapSelection('**', '**', 'bold text')}>
                  <Bold aria-hidden className="size-4" />
                </IconButton>
                <IconButton label="Italic" onClick={() => wrapSelection('_', '_', 'italic text')}>
                  <Italic aria-hidden className="size-4" />
                </IconButton>
                <IconButton label="Insert link" onClick={() => wrapSelection('[', '](https://)', 'link text')}>
                  <LinkIcon aria-hidden className="size-4" />
                </IconButton>
                <IconButton label="Bulleted list" onClick={() => wrapSelection('\n- ', '', 'list item')}>
                  <List aria-hidden className="size-4" />
                </IconButton>
                <IconButton label="Attach files" onClick={() => fileRef.current?.click()}>
                  <Paperclip aria-hidden className="size-4" />
                </IconButton>
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
              </div>
              <IconButton label="Discard draft" className="ml-auto" disabled={sending} onClick={() => void discard()}>
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
            </footer>
            <p className="shrink-0 bg-surface-2 px-4 py-1 text-center text-[11px] text-muted">Prototype: sending is simulated. Nothing leaves this browser.</p>
          </form>
        )}
      </section>
    </>
  )
}
