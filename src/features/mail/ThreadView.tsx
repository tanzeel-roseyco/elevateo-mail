import { Archive, ArrowLeft, ChevronDown, ChevronRight, ChevronUp, FileText, Forward, Inbox, MailOpen, Megaphone, Reply, ReplyAll, ShieldAlert, Star, Trash2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useData } from '@/data/store'
import { identityDomain } from '@/domain/identities'
import { buildReply, lastMessage, type ReplyKind } from '@/domain/mail'
import { plainPreview } from '@/domain/richText'
import type { Message, StoredFolder, Thread } from '@/domain/schema'
import { openComposer } from '@/features/compose/composerStore'
import { cx, formatBytes, formatDateTime, formatWhen, initials } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { BrandBanner, DomainDot, RichText, UnsubscribeFooter } from '@/ui/Bits'
import { Button, IconButton } from '@/ui/Button'

function MessageCard({ message, expanded, onToggle, bannerText }: { message: Message; expanded: boolean; onToggle(): void; bannerText?: string }) {
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <article className="rounded-xl border border-line">
      <h3>
        <button type="button" aria-expanded={expanded} onClick={onToggle} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left hover:bg-surface-2">
          <span aria-hidden className={cx('flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', message.direction === 'out' ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg')}>
            {initials(message.from.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {message.from.name} <span className="font-normal text-muted">&lt;{message.from.email}&gt;</span>
            </span>
            <span className="block truncate text-[13px] font-normal text-muted">
              {expanded ? `to ${[...message.to, ...message.cc].map((a) => a.email).join(', ')}` : plainPreview(message.body, 110)}
            </span>
          </span>
          <time dateTime={message.at} className="shrink-0 text-xs font-normal text-muted" title={formatDateTime(message.at)}>
            {formatWhen(message.at)}
          </time>
          <Chevron aria-hidden className="size-4 shrink-0 text-muted" />
        </button>
      </h3>
      {expanded && (
        <div className="flex flex-col gap-3 px-3.5 pb-4 pl-[3.6rem] text-sm">
          <RichText source={message.body} />
          {message.signature && <p className="whitespace-pre-line text-[13px] text-muted">{message.signature}</p>}
          {message.bannerDomain && <BrandBanner domain={message.bannerDomain} text={bannerText} />}
          {message.unsubscribeFooter && <UnsubscribeFooter text={message.unsubscribeFooter} />}
          {message.attachments.length > 0 && (
            <div>
              <ul aria-label="Attachments" className="flex flex-wrap gap-2">
                {message.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px]">
                    <FileText aria-hidden className="size-4 text-muted" />
                    <span className="font-medium">{a.name}</span>
                    <span className="text-muted">{formatBytes(a.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted">Attachments are mock files; downloading is unavailable in the prototype.</p>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

/** Where the open conversation sits in the filtered list, with links to its neighbours when they exist. */
export interface ReaderNav {
  position: string
  newer?: string
  older?: string
}

function NavLink({ to, label, children }: { to?: string; label: string; children: ReactNode }) {
  const base = 'inline-flex size-8 shrink-0 items-center justify-center rounded-full'
  // At either end of the list there is nothing to link to: show the arrow dimmed rather than a dead control.
  if (!to) return <span aria-hidden className={cx(base, 'text-muted opacity-40')}>{children}</span>
  return (
    <Link to={to} aria-label={label} title={label} className={cx(base, 'text-fg hover:bg-surface-2')}>
      {children}
    </Link>
  )
}

interface Props {
  thread: Thread
  /** Split pane shows a close (×); the single-pane flow shows "back to list". */
  split: boolean
  /** Absent when the conversation is not part of the current list (e.g. it stopped matching a filter). */
  nav?: ReaderNav
  onClose(): void
  /** Moves the thread and offers Undo; owned by MailPage so list and reader behave identically. */
  onMove(ids: string[], folder: StoredFolder): void
}

// AIDEV-NOTE: Reader = triage bar (top), one readable column, pinned reply bar (bottom) so the next action never scrolls away.
export function ThreadView({ thread, split, nav, onClose, onMove }: Props) {
  const patchThreads = useData((s) => s.patchThreads)
  const identities = useData((s) => s.identities)
  const domains = useData((s) => s.domains)
  const campaign = useData((s) => s.campaigns.find((c) => c.id === thread.campaignId))
  const lastId = lastMessage(thread).id
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([lastId]))

  // Opening a conversation reads it; a newly arrived/sent message is expanded automatically.
  useEffect(() => {
    if (thread.unread) patchThreads([thread.id], { unread: false })
    setExpanded((prev) => new Set(prev).add(lastId))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on thread switch or new message, not on every unread flip
  }, [thread.id, lastId])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const reply = (kind: ReplyKind) => openComposer(buildReply(thread, kind, identities, formatDateTime))
  const moveAndClose = (folder: StoredFolder) => {
    onMove([thread.id], folder)
    onClose()
  }
  const discarded = thread.folder === 'trash' || thread.folder === 'spam'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-line px-2 py-1.5">
        <IconButton label={split ? 'Close conversation' : 'Back to list'} onClick={onClose}>
          {split ? <X aria-hidden className="size-4" /> : <ArrowLeft aria-hidden className="size-4" />}
        </IconButton>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        {thread.folder === 'archive' || discarded ? (
          <IconButton label="Move to inbox" onClick={() => moveAndClose('inbox')}>
            <Inbox aria-hidden className="size-4" />
          </IconButton>
        ) : (
          <IconButton label="Archive" onClick={() => moveAndClose('archive')}>
            <Archive aria-hidden className="size-4" />
          </IconButton>
        )}
        {thread.folder !== 'spam' && (
          <IconButton label="Report spam" onClick={() => moveAndClose('spam')}>
            <ShieldAlert aria-hidden className="size-4" />
          </IconButton>
        )}
        {thread.folder !== 'trash' && (
          <IconButton label="Move to trash" onClick={() => moveAndClose('trash')}>
            <Trash2 aria-hidden className="size-4" />
          </IconButton>
        )}
        <IconButton
          label="Mark as unread"
          onClick={() => {
            patchThreads([thread.id], { unread: true })
            onClose()
          }}
        >
          <MailOpen aria-hidden className="size-4" />
        </IconButton>
        <IconButton label={thread.starred ? 'Remove star' : 'Add star'} aria-pressed={thread.starred} onClick={() => patchThreads([thread.id], { starred: !thread.starred })}>
          <Star aria-hidden className={cx('size-4', thread.starred && 'fill-warn text-warn')} />
        </IconButton>
        {nav && (
          <div className="ml-auto flex items-center gap-0.5">
            <span className="px-1.5 text-xs tabular-nums text-muted">{nav.position}</span>
            <NavLink to={nav.newer} label="Newer conversation">
              <ChevronUp aria-hidden className="size-4" />
            </NavLink>
            <NavLink to={nav.older} label="Older conversation">
              <ChevronDown aria-hidden className="size-4" />
            </NavLink>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 md:px-8">
        {/* A fixed measure keeps long emails readable on wide monitors instead of stretching edge to edge. */}
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl font-semibold leading-snug tracking-tight">{thread.subject}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {campaign ? (
              <Link to={`/campaigns/${campaign.id}`}>
                <Badge tone="accent" icon={Megaphone}>
                  Campaign: {campaign.name}
                </Badge>
              </Link>
            ) : (
              <Badge>Ordinary message</Badge>
            )}
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <DomainDot domain={identityDomain(thread.identityId)} />
              {thread.messages[0]?.direction === 'out' ? 'Sent from' : 'Received by'} {thread.identityId}
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            {thread.messages.map((m) => (
              <MessageCard key={m.id} message={m} expanded={expanded.has(m.id)} onToggle={() => toggle(m.id)} bannerText={domains.find((d) => d.domain === m.bannerDomain)?.bannerText} />
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-surface px-3 py-2.5 md:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          <Button variant="primary" icon={<Reply aria-hidden className="size-4" />} onClick={() => reply('reply')}>
            Reply
          </Button>
          <Button icon={<ReplyAll aria-hidden className="size-4" />} onClick={() => reply('replyAll')}>
            Reply all
          </Button>
          <Button icon={<Forward aria-hidden className="size-4" />} onClick={() => reply('forward')}>
            Forward
          </Button>
          {/* buildReply defaults the sender to this address; saying so here saves opening the composer to check. */}
          <span className="ml-auto hidden min-w-0 truncate text-xs text-muted sm:block">Replies go from {thread.identityId}</span>
        </div>
      </div>
    </div>
  )
}
