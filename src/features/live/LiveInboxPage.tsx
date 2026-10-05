import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Inbox, MailOpen, RefreshCw, Reply } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import type { MessageSummary, ServerMailbox } from '@/data/http/contract'
import { live, useLive } from '@/data/http/instance'
import { PAGE_LIMIT } from '@/data/http/live'
import { cx, formatDateTime, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { EmptyState, Skeleton, usePageTitle } from '@/ui/Bits'
import { Button, IconButton } from '@/ui/Button'
import { Select } from '@/ui/Field'
import { MailboxHistoryControls } from './MailboxHistoryControls'
import { usePagePosition } from './paging'
import { InboxNotifications } from './InboxNotifications'

function ErrorPanel({ title, message, retry }: { title: string; message: string; retry(): void }) {
  return (
    <div role="alert">
      <EmptyState icon={AlertTriangle} title={title} body={message} action={<Button variant="primary" onClick={retry}>Try again</Button>} />
    </div>
  )
}

function MessageRow({ message, href, state, active }: { message: MessageSummary; href: string; state: unknown; active: boolean }) {
  return (
    <li className={cx('border-b border-line', active ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
      <Link to={href} state={state} aria-current={active ? 'true' : undefined} className="flex flex-col gap-0.5 px-4 py-2.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{message.sender}</span>
          <time dateTime={message.at} className="shrink-0 text-xs tabular-nums text-muted">
            {formatWhen(message.at)}
          </time>
        </span>
        <span className="truncate text-[13px] text-muted">{message.subject || '(no subject)'}</span>
      </Link>
    </li>
  )
}

function MessageList({ mailbox, openId }: { mailbox: ServerMailbox; openId: string | undefined }) {
  const list = useLive((s) => s.list)
  const position = usePagePosition()
  const { cursor, pageNumber } = position
  const before = cursor?.before
  const beforeId = cursor?.beforeId
  // One page is fetched and rendered at a time, so the list never grows beyond PAGE_LIMIT rows.
  useEffect(() => {
    void live.openList(mailbox.id, before !== undefined && beforeId !== undefined ? { before, beforeId } : null)
  }, [mailbox.id, before, beforeId])

  const listHref = `/mail/${mailbox.id}`
  const onPage = list?.mailboxId === mailbox.id && (list.cursor?.beforeId ?? null) === (cursor?.beforeId ?? null) && (list.cursor?.before ?? null) === (cursor?.before ?? null)

  if (!list || !onPage || list.page.status === 'loading' || list.page.status === 'idle') return <Skeleton rows={8} />
  if (list.page.status === 'error') return <ErrorPanel title="Messages could not be loaded" message={list.page.message} retry={() => void live.reloadPage()} />
  const { items, next } = list.page.data
  return (
    <>
      {items.length === 0 ? (
        <EmptyState icon={Inbox} title={cursor ? 'No older messages' : 'No messages stored'} body={cursor ? 'You have reached the end of this mailbox.' : 'No messages have been stored for this mailbox. Check its connection and sync status in Connections, or import your message history.'} />
      ) : (
        <ul aria-label={`Messages in ${mailbox.address}`} className="min-h-0 flex-1 overflow-y-auto">
          {items.map((m) => (
            <MessageRow key={m.id} message={m} href={`${listHref}/${m.id}${position.search}`} state={position.state} active={m.id === openId} />
          ))}
        </ul>
      )}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-3 py-1.5 text-[13px] text-muted">
        <span aria-live="polite">
          {pageNumber ? `Page ${pageNumber}` : 'Older messages'} · up to {PAGE_LIMIT} per page
        </span>
        <IconButton label={pageNumber ? 'Newer messages' : 'Newest messages'} disabled={!cursor} onClick={() => position.newer(listHref)}>
          <ChevronLeft aria-hidden className="size-4" />
        </IconButton>
        <IconButton label="Older messages" disabled={!next} onClick={() => next && position.older(listHref, next)}>
          <ChevronRight aria-hidden className="size-4" />
        </IconButton>
      </div>
    </>
  )
}

function Reader({ mailbox, messageId, backHref }: { mailbox: ServerMailbox; messageId: string; backHref: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const entry = useLive((s) => s.bodies.find((b) => b.key === `${mailbox.id}/${messageId}`))
  // The body is fetched only when a message is opened; the list never carries it.
  useEffect(() => {
    void live.openBody(mailbox.id, messageId)
  }, [mailbox.id, messageId])

  const body = entry?.body
  return (
    <article className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Link to={backHref} state={location.state} aria-label="Back to messages" title="Back to messages" className="inline-flex size-8 items-center justify-center rounded-full hover:bg-surface-2 lg:hidden">
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <Badge tone="neutral">Plain text · external sender</Badge>
        {body?.status === 'ready' && (
          <Button size="sm" className="ml-auto" disabled={!mailbox.connected || !mailbox.sendEnabled || body.data.incomplete} title={body.data.incomplete ? 'Read the complete original before replying' : mailbox.connected && mailbox.sendEnabled ? undefined : 'This mailbox is not allowed to send'} icon={<Reply aria-hidden className="size-3.5" />} onClick={() => void navigate('/compose', { state: { mailboxId: mailbox.id, replyTo: messageId } })}>
            Reply
          </Button>
        )}
      </div>
      {(!body || body.status === 'loading' || body.status === 'idle') && <Skeleton rows={6} />}
      {body?.status === 'error' && <ErrorPanel title="This message could not be loaded" message={body.message} retry={() => void live.openBody(mailbox.id, messageId)} />}
      {body?.status === 'ready' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
          {/* AIDEV-NOTE: A failed re-import can leave older text; warning and reply gating preserve that distinction. */}
          {body.data.incomplete && <p role="alert" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">This message is incomplete. Saved text may be out of date. Open the original in your mail provider before replying.</p>}
          <h2 className="text-lg font-semibold leading-snug">{body.data.subject || '(no subject)'}</h2>
          <p className="mt-1 text-[13px] text-muted">
            From <span className="break-all font-medium text-fg">{body.data.sender}</span> to <span className="break-all">{mailbox.address}</span> · <time dateTime={body.data.at}>{formatDateTime(body.data.at)}</time>
          </p>
          {/* Rendered as text, never as HTML: whatever the sender wrote is shown literally and cannot run or load anything. */}
          <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{body.data.body}</pre>
        </div>
      )}
    </article>
  )
}

// AIDEV-NOTE: API-backed inbox. Mailbox and open message live in the URL; one page of summaries is held at a time
// (its position is the server cursor in the query string) and a body is fetched only when its message is opened. Search uses a separate bounded metadata route and never eagerly fetches message bodies.
export function LiveInboxPage() {
  usePageTitle('Inbox')
  const { mailboxId, messageId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const mailboxes = useLive((s) => s.mailboxes)
  const connected = mailboxes.filter((m) => m.connected)
  const mailbox = mailboxes.find((m) => m.id === mailboxId)
  const [lookup, setLookup] = useState<{ id: string; error: string | null } | null>(null)
  useEffect(() => {
    let active = true
    if (mailboxId) void live.ensureMailbox(mailboxId).then(() => { if (active) setLookup({ id: mailboxId, error: null }) }).catch((error: unknown) => {
      if (active) setLookup({ id: mailboxId, error: error instanceof Error ? error.message : 'Mailbox could not be loaded.' })
    })
    return () => { active = false }
  }, [mailboxId])


  if (!mailboxId) {
    const first = connected[0] ?? mailboxes[0]
    if (first) return <Navigate to={`/mail/${first.id}`} replace />
    return <div><MailboxHistoryControls /><EmptyState icon={Inbox} title="No connected mailboxes" body="Connect a mailbox in Connections, or browse disconnected mailboxes to read stored history." /></div>
  }
  if (!mailbox) return <div><MailboxHistoryControls />{lookup?.id === mailboxId && lookup.error
    ? <ErrorPanel title="Mailbox could not be loaded" message={lookup.error} retry={() => { setLookup(null); void live.ensureMailbox(mailboxId).catch((error: unknown) => setLookup({ id: mailboxId, error: error instanceof Error ? error.message : 'Mailbox could not be loaded.' })) }} />
    : <Skeleton rows={3} />}</div>

  const listHref = `/mail/${mailbox.id}${location.search}`

  return (
    <div className="flex h-full min-h-0">
      <section aria-label="Message list" className={cx('flex min-h-0 w-full flex-col lg:w-[380px] lg:shrink-0 lg:border-r lg:border-line', messageId && 'hidden lg:flex')}>
        <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
            <IconButton label="Refresh messages" className="ml-auto" onClick={() => void live.reloadPage()}>
              <RefreshCw aria-hidden className="size-4" />
            </IconButton>
          </div>
          <label className="sr-only" htmlFor="live-mailbox">
            Mailbox
          </label>
          <Select id="live-mailbox" value={mailbox.id} onChange={(e) => void navigate(`/mail/${e.target.value}`)}>
            {mailboxes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.address}
                {m.connected ? '' : ' (disconnected)'}
              </option>
            ))}
          </Select>
          <MailboxHistoryControls />
          <InboxNotifications />
          <Link to="/search" className="text-xs text-muted hover:text-fg">Search stored mail</Link>
          {!mailbox.connected && <p className="text-xs text-muted">This mailbox is disconnected. Messages the server already holds are still listed.</p>}
        </div>
        <MessageList mailbox={mailbox} openId={messageId} />
      </section>
      <section aria-label="Message" className={cx('min-h-0 min-w-0 flex-1', !messageId && 'hidden lg:block')}>
        {messageId ? <Reader key={messageId} mailbox={mailbox} messageId={messageId} backHref={listHref} /> : <EmptyState icon={MailOpen} title="No message open" body="Choose a message to read it. Its text is fetched only when you open it." />}
      </section>
    </div>
  )
}
