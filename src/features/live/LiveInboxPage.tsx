import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Inbox, MailOpen, RefreshCw, Reply } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { z } from 'zod'
import { isServerId, type MessageCursor, type MessageSummary, type ServerMailbox } from '@/data/http/contract'
import { live, useLive } from '@/data/http/instance'
import { PAGE_LIMIT } from '@/data/http/live'
import { cx, formatDateTime, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { EmptyState, Skeleton, usePageTitle } from '@/ui/Bits'
import { Button, IconButton } from '@/ui/Button'
import { Select } from '@/ui/Field'

function ErrorPanel({ title, message, retry }: { title: string; message: string; retry(): void }) {
  return (
    <div role="alert">
      <EmptyState icon={AlertTriangle} title={title} body={message} action={<Button variant="primary" onClick={retry}>Try again</Button>} />
    </div>
  )
}

// AIDEV-NOTE: The page position lives in the URL (?before=&beforeId=, the server's own cursor), so a reload or a
// shared link reopens the same page. The cursors of the pages walked through ride in history state, only to offer
// "Newer"; a link opened cold has no such trail and offers "Newest" instead.
const trailSchema = z.object({ trail: z.array(z.object({ before: z.number().int().nonnegative(), beforeId: z.string().refine(isServerId) })).max(500) })
const readTrail = (state: unknown): MessageCursor[] | null => {
  const parsed = trailSchema.safeParse(state)
  return parsed.success ? parsed.data.trail : null
}
function readCursor(params: URLSearchParams): MessageCursor | null {
  const before = Number(params.get('before'))
  const beforeId = params.get('beforeId')
  if (!params.get('before') || !Number.isSafeInteger(before) || before < 0 || !beforeId || !isServerId(beforeId)) return null
  return { before, beforeId }
}
const cursorSearch = (cursor: MessageCursor | undefined): string => (cursor ? `?before=${cursor.before}&beforeId=${cursor.beforeId}` : '')

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
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const cursor = readCursor(params)
  const before = cursor?.before
  const beforeId = cursor?.beforeId
  // One page is fetched and rendered at a time, so the list never grows beyond PAGE_LIMIT rows.
  useEffect(() => {
    void live.openList(mailbox.id, before !== undefined && beforeId !== undefined ? { before, beforeId } : null)
  }, [mailbox.id, before, beforeId])

  const listHref = `/mail/${mailbox.id}`
  // The trail is trusted only when it ends at the page the URL names; otherwise the position is simply not known.
  const walked = readTrail(location.state)
  const trail = !cursor ? [] : walked && walked.at(-1)?.before === cursor.before && walked.at(-1)?.beforeId === cursor.beforeId ? walked : null
  const pageNumber = trail ? trail.length + 1 : null
  const onPage = list?.mailboxId === mailbox.id && (list.cursor?.beforeId ?? null) === (cursor?.beforeId ?? null) && (list.cursor?.before ?? null) === (cursor?.before ?? null)

  if (!list || !onPage || list.page.status === 'loading' || list.page.status === 'idle') return <Skeleton rows={8} />
  if (list.page.status === 'error') return <ErrorPanel title="Messages could not be loaded" message={list.page.message} retry={() => void live.reloadPage()} />
  const { items, next } = list.page.data
  const older = () => next && void navigate(`${listHref}${cursorSearch(next)}`, { state: trail ? { trail: [...trail, next] } : null })
  const newer = () => void navigate(`${listHref}${cursorSearch(trail?.at(-2))}`, { state: trail ? { trail: trail.slice(0, -1) } : null })

  return (
    <>
      {items.length === 0 ? (
        <EmptyState icon={Inbox} title={cursor ? 'No older messages' : 'No messages stored'} body={cursor ? 'You have reached the end of this mailbox.' : 'The server holds no messages for this mailbox. Mail is not synchronised from a real provider yet.'} />
      ) : (
        <ul aria-label={`Messages in ${mailbox.address}`} className="min-h-0 flex-1 overflow-y-auto">
          {items.map((m) => (
            <MessageRow key={m.id} message={m} href={`${listHref}/${m.id}${location.search}`} state={location.state} active={m.id === openId} />
          ))}
        </ul>
      )}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-3 py-1.5 text-[13px] text-muted">
        <span aria-live="polite">
          {pageNumber ? `Page ${pageNumber}` : 'Older messages'} · up to {PAGE_LIMIT} per page
        </span>
        <IconButton label={pageNumber ? 'Newer messages' : 'Newest messages'} disabled={!cursor} onClick={newer}>
          <ChevronLeft aria-hidden className="size-4" />
        </IconButton>
        <IconButton label="Older messages" disabled={!next} onClick={older}>
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
          <Button size="sm" className="ml-auto" disabled={!mailbox.connected || !mailbox.sendEnabled} title={mailbox.connected && mailbox.sendEnabled ? undefined : 'This mailbox is not allowed to send'} icon={<Reply aria-hidden className="size-3.5" />} onClick={() => void navigate('/compose', { state: { mailboxId: mailbox.id, to: body.data.sender, subject: /^re:/i.test(body.data.subject) ? body.data.subject : `Re: ${body.data.subject}` } })}>
            Reply
          </Button>
        )}
      </div>
      {(!body || body.status === 'loading' || body.status === 'idle') && <Skeleton rows={6} />}
      {body?.status === 'error' && <ErrorPanel title="This message could not be loaded" message={body.message} retry={() => void live.openBody(mailbox.id, messageId)} />}
      {body?.status === 'ready' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
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
// (its position is the server cursor in the query string) and a body is fetched only when its message is opened. The server offers no search, so none is shown.
export function LiveInboxPage() {
  usePageTitle('Inbox')
  const { mailboxId, messageId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const mailboxes = useLive((s) => s.mailboxes)
  const connected = mailboxes.filter((m) => m.connected)
  const mailbox = mailboxes.find((m) => m.id === mailboxId)

  if (!mailboxId) {
    const first = connected[0] ?? mailboxes[0]
    if (first) return <Navigate to={`/mail/${first.id}`} replace />
    return <EmptyState icon={Inbox} title="No mailboxes on this account" body="The server lists no mailboxes for you. Connecting a real mailbox is not available yet." />
  }
  if (!mailbox) return <EmptyState icon={AlertTriangle} title="Mailbox not found" body="This account has no mailbox with that reference." action={<Link to="/mail" className="font-medium text-accent-text underline underline-offset-2">Go to inbox</Link>} />

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
          <p className="text-xs text-muted">Search is not available yet.</p>
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
