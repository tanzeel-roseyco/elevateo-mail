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
  scan_status: 'pending_scan' | 'clean' | 'malware' | 'scan_failed'
}

export interface AttachmentReadPort {
  listInboxAttachments(ctx: ReadContext, mailboxId: string, threadId: string, messageId: string, query: { cursor?: string; limit: number }, signal: AbortSignal): Promise<{ items: AttachmentSummary[]; next_cursor: string | null }>
  downloadCleanInboxAttachment(ctx: ReadContext, mailboxId: string, threadId: string, messageId: string, attachmentId: string, signal: AbortSignal): Promise<Blob>
}

type ListState =
  | { status: 'closed' | 'loading' | 'unavailable' | 'error' }
  | { status: 'ready'; items: AttachmentSummary[]; nextCursor: string | null; loadingMore: boolean; error: string | null }

function statusText(status: AttachmentSummary['scan_status']): string {
  if (status === 'pending_scan') return 'Pending security scan; download held'
  if (status === 'malware') return 'Blocked by security scan'
  if (status === 'scan_failed') return 'Security scan failed; download held'
  return 'Scan complete'
}

export function MessageAttachments({ mailboxId, threadId, messageId, count, port }: {
  mailboxId: string; threadId: string; messageId: string; count: number; port: AttachmentReadPort
}) {
  const { request } = useProtectedRequest()
  const [state, setState] = useState<ListState>({ status: 'closed' })
  const [downloadState, setDownloadState] = useState<{ id: string; status: 'loading' | 'error' | 'unavailable' } | null>(null)
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
    setDownloadState({ id: item.id, status: 'loading' })
    const result = await request((ctx, signal) => port.downloadCleanInboxAttachment(ctx, mailboxId, threadId, messageId, item.id, signal))
    if (result.kind === 'stale') return
    if (result.kind === 'failed') {
      setDownloadState({ id: item.id, status: isApiError(result.error, 'not_available') || (result.error instanceof Error && 'status' in result.error && result.error.status === 423) ? 'unavailable' : 'error' })
      return
    }
    if (result.value.size !== item.byte_size || result.value.size > 10 * 1024 * 1024) {
      setDownloadState({ id: item.id, status: 'error' })
      return
    }
    let url: string | null = null
    try {
      const createdUrl = URL.createObjectURL(result.value)
      url = createdUrl
      activeUrls.current.add(createdUrl)
      const anchor = document.createElement('a')
      anchor.href = createdUrl
      anchor.download = item.filename
      anchor.click()
      // A short delay lets the browser start the download; owner cleanup also revokes pending URLs.
      window.setTimeout(() => { URL.revokeObjectURL(createdUrl); activeUrls.current.delete(createdUrl) }, 1000)
      setDownloadState(null)
    } catch {
      if (url !== null) { URL.revokeObjectURL(url); activeUrls.current.delete(url) }
      setDownloadState({ id: item.id, status: 'error' })
    }
  }

  return <section aria-label={`Attachments for message ${messageId}`} className="mt-2">
    {state.status === 'closed' && <Button size="sm" onClick={() => void load()}>Show {count} attachment{count === 1 ? '' : 's'}</Button>}
    {state.status === 'loading' && <p role="status">Loading attachments…</p>}
    {state.status === 'unavailable' && <p role="alert">Attachments are unavailable for this message.</p>}
    {state.status === 'error' && <p role="alert">Attachments could not be loaded. <Button size="sm" onClick={() => void load()}>Retry attachments</Button></p>}
    {state.status === 'ready' && <>
      {state.items.length === 0 && <p>No attachment metadata is available.</p>}
      <ul className="flex flex-col gap-2">{state.items.map((item) => <li key={item.id}>
        <span>{item.filename} ({item.byte_size} bytes) — {statusText(item.scan_status)}</span>
        {item.scan_status === 'clean' && <Button size="sm" disabled={downloadState?.id === item.id && downloadState.status === 'loading'} onClick={() => void download(item)}>Download {item.filename}</Button>}
        {downloadState?.id === item.id && downloadState.status === 'unavailable' && <p role="alert">This attachment is no longer available to download.</p>}
        {downloadState?.id === item.id && downloadState.status === 'error' && <p role="alert">Download failed. Retry explicitly.</p>}
      </li>)}</ul>
      {state.error && <p role="alert">{state.error}</p>}
      {state.nextCursor && <Button size="sm" disabled={state.loadingMore} onClick={() => void load(state.nextCursor ?? undefined)}>{state.loadingMore ? 'Loading…' : 'Show more attachments'}</Button>}
    </>}
  </section>
}
