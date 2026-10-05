import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'

const resultSchema = z.object({
  provider: z.literal('claude'),
  binding: z.object({ accountId: z.string().max(128), mailboxId: z.string().max(128), requestId: z.string().max(128), sessionGeneration: z.string().max(64), expiresAt: z.number() }),
  draft: z.object({ subject: z.string().max(998), body: z.string().max(60000) }),
})
type NativeWindow = Window & { __TAURI__?: { core: { invoke: (command: string, args: { handoff: string }) => Promise<unknown> } } }

// AIDEV-NOTE: Only ticket JSON crosses IPC; native configuration fixes the account, origin, executable and arguments.
export function DesktopDraftHandoff() {
  const [handoff, setHandoff] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<z.infer<typeof resultSchema> | null>(null)
  const [error, setError] = useState('')
  const active = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function prepare() {
    if (inFlight.current) return
    const invoke = (window as NativeWindow).__TAURI__?.core.invoke
    if (!invoke) { setError('Open the installed Windows desktop app to use this handoff.'); return }
    inFlight.current = true
    setBusy(true); setDraft(null); setError('')
    const ticket = handoff
    setHandoff('')
    try {
      const result = resultSchema.parse(await invoke('prepare_draft', { handoff: ticket }))
      if (active.current) setDraft(result)
    } catch {
      if (active.current) setError('Draft unavailable. Check the local companion configuration and use a fresh web handoff. No email was sent.')
    } finally {
      inFlight.current = false
      if (active.current) setBusy(false)
    }
  }
  return <details className="border-b border-line bg-surface px-3 py-2 text-sm text-fg">
    <summary>Connected Windows draft handoff</summary>
    <p>The inbox below uses fictional data. This separate action uses your configured Claude account and selected live mailbox context. It never sends email.</p>
    <p>Paste a fresh handoff from the web AI Assistant. Local setup is required. Installed CLI and administrator policy are trusted; this is not an OS sandbox.</p>
    <p>Local AI drafting is unavailable on macOS. The macOS download contains the fictional inbox preview only.</p>
    <label htmlFor="desktop-handoff">One-use handoff JSON</label>
    <textarea id="desktop-handoff" className="block w-full border border-line bg-surface p-2" maxLength={1024} value={handoff} disabled={busy} onChange={event => setHandoff(event.target.value)} autoComplete="off" spellCheck={false} />
    <button type="button" disabled={busy || !handoff.trim()} onClick={() => { void prepare() }}>{busy ? 'Preparing draft…' : 'Prepare draft for review'}</button>
    {busy && <p role="status">This bounded run continues if this panel closes. Closing the application ends its child processes.</p>}
    {error && <p role="alert">{error}</p>}
    {draft && <section aria-label="Review generated draft">
      <p>Claude draft for account {draft.binding.accountId}, mailbox {draft.binding.mailboxId}. Review before copying to your web composer.</p>
      <label htmlFor="desktop-draft-subject">Subject</label>
      <textarea id="desktop-draft-subject" className="block w-full border border-line bg-surface p-2" readOnly value={draft.draft.subject} />
      <label htmlFor="desktop-draft-body">Draft body — select and copy</label>
      <textarea id="desktop-draft-body" className="block w-full border border-line bg-surface p-2" rows={8} readOnly value={draft.draft.body} />
      <button type="button" onClick={() => setDraft(null)}>Clear private draft</button>
    </section>}
  </details>
}
