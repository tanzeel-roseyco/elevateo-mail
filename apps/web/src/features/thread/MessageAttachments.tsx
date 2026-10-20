// ATT830: metadata is private to the current readable message; bytes leave only through the
// authenticated gateway proxy after a fresh clean/verdict and authorization check.
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReadContext } from '@/data/gateway'
import { isApiError } from '@/data/errors'
import { useProtectedRequest } from '@/app/protectedRequest'
import { Button } from '@/ui/Button'

export interface AttachmentSummary {
  id: string
  filename: string
  content_type: 'application/pdf' | 'image/png' | 'image/jpeg' | 'text/plain'
  byte_size: number
  scan_status: 'pending_scan' | 'clean' | 'malware' | 'scan_failed' | 'rejected'
}

export interface AttachmentReadPort {
  listInboxAttachments(ctx: ReadContext, mailboxId: string, threadId: string, messageId: string, query: { cursor?: string; limit: number }, signal: AbortSignal): Promise<{ items: AttachmentSummary[]; next_cursor: string | null }>
  downloadCleanInboxAttachment(ctx: ReadContext, mailboxId: string, threadId: string, messageId: string, attachmentId: string, signal: AbortSignal): Promise<Blob>
}

type ListState =
  | { status: 'closed' | 'loading' | 'unavailable' | 'error' }
  | { status: 'ready'; items: AttachmentSummary[]; nextCursor: string | null; loadingMore: boolean; error: string | null }

// AIDEV-NOTE: FE873 explicit code-point scan instead of a control-char regex (eslint no-control-regex):
// C0 controls, DEL, path separators and the Unicode bidi override/isolate range are all rejected.
function hasForbiddenCodePoint(filename: string): boolean {
  for (const char of filename) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f || char === '\\' || char === '/' ||
        (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) return true
  }
  return false
}

function safeFilename(filename: string): string | null {
  if (filename.length === 0 || filename === '.' || filename === '..' || filename.trim() !== filename ||
      hasForbiddenCodePoint(filename) || new TextEncoder().encode(filename).length > 255) return null
  return filename
}

function canDownload(item: AttachmentSummary): boolean {
  return item.scan_status === 'clean' && safeFilename(item.filename) !== null &&
    Number.isSafeInteger(item.byte_size) && item.byte_size >= 1 && item.byte_size <= 10 * 1024 * 1024
}

function statusText(status: AttachmentSummary['scan_status']): string {
  if (status === 'pending_scan') return 'Pending security scan; download held'
  if (status === 'malware') return 'Blocked by security scan'
  if (status === 'scan_failed') return 'Security scan failed; download held'
  if (status === 'rejected') return 'Rejected before storage; download unavailable'
  if (status === 'clean') return 'Scan complete'
  return 'Attachment unavailable'
}

export function MessageAttachments({ mailboxId, threadId, messageId, count, port }: {
  mailboxId: string; threadId: string; messageId: string; count: number; port: AttachmentReadPort
}) {
  const { request } = useProtectedRequest()
  const [state, setState] = useState<ListState>({ status: 'closed' })
  const [downloadState, setDownloadState] = useState<Map<string, 'loading' | 'error' | 'unavailable'>>(() => new Map())
  const pendingDownloads = useRef(new Set<string>())
  const activeUrls = useRef(new Set<string>())
  // AIDEV-NOTE: The reader keys this component by message; revoke every ephemeral blob URL at owner exit.
  useLayoutEffect(() => {
    const urls = activeUrls.current
    return () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear() }
  }, [])

  async function load(cursor?: string) {
    setState((prior) => cursor && prior.status === 'ready' ? { ...prior, loadingMore: true, error: null } : { status: 'loading' })
    const result = await request((ctx, signal) => port.listInboxAttachments(ctx, mailboxId, threadId, messageId, cursor ? { cursor, limit: 50 } : { limit: 50 }, signal))
    if (result.kind === 'stale') return
    if (result.kind === 'failed') {
      if (isApiError(result.error, 'not_available')) setState({ status: 'unavailable' })
      else setState((prior) => cursor && prior.status === 'ready' ? { ...prior, loadingMore: false, error: 'More attachments could not be loaded. Retry.' } : { status: 'error' })
      return
    }
    setState((prior) => {
      const existing = cursor && prior.status === 'ready' ? prior.items : []
      const ids = new Set(existing.map((item) => item.id))
      const items = [...existing, ...result.value.items.filter((item) => !ids.has(item.id))].slice(0, 1000)
      return {
        status: 'ready',
        items,
        nextCursor: items.length === 1000 || result.value.next_cursor === cursor ? null : result.value.next_cursor,
        loadingMore: false,
        error: null,
      }
    })
  }

  async function download(item: AttachmentSummary) {
    // AIDEV-NOTE: The ref fences duplicate clicks before React commits; each completion owns only its ID.
    if (!canDownload(item)) return
    if (pendingDownloads.current.has(item.id)) return
    pendingDownloads.current.add(item.id)
    const update = (status: 'loading' | 'error' | 'unavailable' | null) => setDownloadState((prior) => {
      const next = new Map(prior)
      if (status === null) next.delete(item.id)
      else next.set(item.id, status)
      return next
    })
    update('loading')
    try {
      const result = await request((ctx, signal) => port.downloadCleanInboxAttachment(ctx, mailboxId, threadId, messageId, item.id, signal))
      if (result.kind === 'stale') return
      if (result.kind === 'failed') {
        update(isApiError(result.error, 'not_available') || (result.error instanceof Error && 'status' in result.error && result.error.status === 423) ? 'unavailable' : 'error')
        return
      }
      if (result.value.size !== item.byte_size || result.value.size > 10 * 1024 * 1024) {
        update('error')
        return
      }
      const createdUrl = URL.createObjectURL(result.value)
      activeUrls.current.add(createdUrl)
      try {
        const anchor = document.createElement('a')
        anchor.href = createdUrl
        anchor.download = safeFilename(item.filename) ?? 'attachment'
        anchor.click()
        // A short delay lets the browser start the download; owner cleanup also revokes pending URLs.
        window.setTimeout(() => { URL.revokeObjectURL(createdUrl); activeUrls.current.delete(createdUrl) }, 1000)
        update(null)
      } catch {
        URL.revokeObjectURL(createdUrl)
        activeUrls.current.delete(createdUrl)
        update('error')
      }
    } catch {
      update('error')
    } finally {
      pendingDownloads.current.delete(item.id)
    }
  }

  return <section aria-label={`Attachments for message ${messageId}`} className="mt-2">
    {state.status === 'closed' && <Button size="sm" onClick={() => void load()}>Show {count} attachment{count === 1 ? '' : 's'}</Button>}
    {state.status === 'loading' && <p role="status">Loading attachments…</p>}
    {state.status === 'unavailable' && <p role="alert">Attachments are unavailable for this message.</p>}
    {state.status === 'error' && <p role="alert">Attachments could not be loaded. <Button size="sm" onClick={() => void load()}>Retry attachments</Button></p>}
    {state.status === 'ready' && <>
      {state.items.length === 0 && <p>No attachment metadata is available.</p>}
      {/* break-all + short button text: a 255-byte unbroken filename wraps in the row (TS-02). */}
      <ul className="flex flex-col gap-2">{state.items.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-all">{safeFilename(item.filename) ?? 'Attachment'} ({item.byte_size} bytes) — {canDownload(item) || item.scan_status !== 'clean' ? statusText(item.scan_status) : 'Attachment unavailable'}</span>
        {canDownload(item) && <Button size="sm" aria-label={`Download ${safeFilename(item.filename) ?? ''}`} disabled={downloadState.get(item.id) === 'loading'} onClick={() => void download(item)}>Download</Button>}
        {downloadState.get(item.id) === 'unavailable' && <p role="alert">This attachment is no longer available to download.</p>}
        {downloadState.get(item.id) === 'error' && <p role="alert">Download failed. Retry explicitly.</p>}
      </li>)}</ul>
      {state.error && <p role="alert">{state.error}</p>}
      {state.nextCursor && <Button size="sm" disabled={state.loadingMore} onClick={() => void load(state.nextCursor ?? undefined)}>{state.loadingMore ? 'Loading…' : 'Show more attachments'}</Button>}
    </>}
  </section>
}
