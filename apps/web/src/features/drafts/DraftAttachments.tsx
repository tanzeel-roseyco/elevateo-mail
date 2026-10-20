import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway } from '@/app/session'
import { prepareDraftUpload, type DraftAttachment, type DraftUpload } from '@/data/draftAttachmentGateway'
import { newId } from '@/lib/ids'
import { Button } from '@/ui/Button'

const statusText: Record<DraftAttachment['status'], string> = {
  pending_scan: 'Waiting for security scan', clean: 'Ready to send',
  malware: 'Blocked by security scan', scan_failed: 'Security scan failed; sending is blocked',
}

// AIDEV-NOTE: The keyed editor owns this panel; protected requests discard completions after scope changes.
export function DraftAttachments({ draftId, mailboxId, disabled }: { draftId: string; mailboxId: string; disabled: boolean }) {
  const port = useGateway().draftAttachments
  const { proof, request } = useProtectedRequest()
  const inputId = useId()
  const [items, setItems] = useState<DraftAttachment[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<DraftUpload | null>(null)
  const active = useRef(false)
  const revision = useRef(0)
  const load = useCallback(async () => {
    if (!port || active.current) return
    const current = ++revision.current
    const outcome = await request((ctx, signal) => port.list(ctx, draftId, mailboxId, signal))
    if (current !== revision.current) return
    if (outcome.kind === 'ok') setItems(outcome.value.items)
    else if (outcome.kind === 'failed') setMessage('Attachments could not be loaded. Refresh to try again.')
  }, [port, request, draftId, mailboxId])
  useEffect(() => { void load() }, [load])
  if (!port) return null

  const upload = async (file?: File) => {
    if (!proof || disabled || active.current || (!file && !pending)) return
    revision.current += 1
    active.current = true; setBusy(true); setMessage(null)
    const outcome = await request(async (ctx, signal) => {
      const input = pending ?? await prepareDraftUpload(file!, mailboxId, newId())
      if (signal.aborted) throw signal.reason
      // Keep identical bytes and operation for an uncertain response; never silently start a second upload.
      setPending(input)
      return port.upload(ctx, proof, draftId, input, signal)
    })
    active.current = false
    if (outcome.kind === 'stale') return
    setBusy(false)
    if (outcome.kind === 'ok') { setItems([outcome.value]); setPending(null) }
    else setMessage(pending || file ? 'Upload was not confirmed. Keep this page open and retry the same file. Invalid files must be PDF, PNG, JPEG or text, at most 1 MiB.' : 'Upload unavailable.')
  }
  const remove = async (attachment: DraftAttachment) => {
    if (!proof || disabled || active.current) return
    revision.current += 1
    active.current = true; setBusy(true); setMessage(null)
    const outcome = await request((ctx, signal) => port.remove(ctx, proof, draftId, mailboxId, attachment.id, signal))
    active.current = false
    if (outcome.kind === 'stale') return
    setBusy(false)
    if (outcome.kind === 'ok') { setItems([]); setPending(null) }
    else setMessage('Removal was not confirmed. Refresh attachments before trying again.')
  }
  return <section aria-label="Draft attachment" aria-busy={busy} className="rounded-lg border border-zinc-200 p-3 text-sm">
    <h2 className="font-semibold">Attachment</h2>
    <p className="my-1 text-zinc-500">One PDF, PNG, JPEG or text file, at most 1 MiB. Sending waits for a successful security scan.</p>
    {items === null && message === null && <p role="status">Loading attachments...</p>}
    {items?.map((item) => <div key={item.id} className="my-2 flex flex-wrap items-center gap-2">
      <span className="break-all">{item.filename} ({item.byte_size} bytes)</span>
      <span role="status">{statusText[item.status]}</span>
      <Button disabled={disabled || busy || !proof} onClick={() => void remove(item)}>Remove attachment</Button>
    </div>)}
    {items?.length === 0 && !pending && <div className="my-2">
      <label htmlFor={inputId} className="block">Choose attachment</label>
      <input id={inputId} type="file" accept="application/pdf,image/png,image/jpeg,text/plain" disabled={disabled || busy || !proof}
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} />
    </div>}
    {pending && <Button disabled={disabled || busy || !proof} onClick={() => void upload()}>Retry same attachment</Button>}
    <Button disabled={busy} onClick={() => { setMessage(null); void load() }}>Refresh attachments</Button>
    {message && <p role="alert" className="mt-2">{message}</p>}
  </section>
}
