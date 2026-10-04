import { Archive, Megaphone, Paperclip, Star, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { useData } from '@/data/store'
import { identityDomain } from '@/domain/identities'
import { lastMessage } from '@/domain/mail'
import { plainPreview } from '@/domain/richText'
import type { Draft, Thread } from '@/domain/schema'
import { openDraft } from '@/features/compose/composerStore'
import { cx, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { DomainDot } from '@/ui/Bits'
import { IconButton } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { toast } from '@/ui/toast'

interface ThreadRowProps {
  thread: Thread
  href: string
  /** Split view stacks sender over subject because the list column is narrow. */
  stacked: boolean
  selected: boolean
  active: boolean
  sentView: boolean
  /** Hidden once the list is already narrowed to one address, where it would repeat on every row. */
  showMailbox: boolean
  campaignName?: string
  onSelect(): void
  onStar(): void
  /** Omitted in folders where archiving makes no sense (archive, spam, trash). */
  onArchive?(): void
}

/**
 * "lachlan@boltloop": the local part plus the domain's first label. Shorter than the full address, yet it still tells
 * apart two addresses on one domain and the same local part on two domains.
 */
export function mailboxLabel(identityId: string): string {
  const [local, host] = identityId.split('@')
  if (!local || !host) return identityId
  return `${local}@${host.split('.')[0] ?? host}`
}

// AIDEV-NOTE: One conversation row. Unread = dot + weight (never colour alone); the mailbox label says which address got it.
export function ThreadRow({ thread, href, stacked, selected, active, sentView, showMailbox, campaignName, onSelect, onStar, onArchive }: ThreadRowProps) {
  const last = lastMessage(thread)
  // Sent shows who we wrote to; everywhere else shows who wrote to us (or our recipient if we spoke last).
  // In Sent the newest message may be their reply addressed to us, so read our own latest message instead.
  const lastOutbound = [...thread.messages].reverse().find((m) => m.direction === 'out')
  const firstRecipient = (sentView ? (lastOutbound ?? last) : last).to[0]
  const who = sentView || last.direction === 'out' ? `To: ${firstRecipient?.name ?? 'unknown'}` : last.from.name
  const hasFiles = thread.messages.some((m) => m.attachments.length > 0)
  const domain = identityDomain(thread.identityId)
  const timeClass = cx('shrink-0 text-xs tabular-nums', thread.unread ? 'text-fg' : 'font-normal text-muted')

  return (
    <li className={cx('row group flex items-start gap-1 border-b border-line pl-2 pr-2', active ? 'bg-accent-soft' : selected ? 'bg-accent-soft/60' : 'bg-surface hover:bg-surface-2')}>
      <input type="checkbox" aria-label={`Select conversation: ${thread.subject}`} checked={selected} onChange={onSelect} className="mt-1.5 size-4 shrink-0 accent-[var(--accent)]" />
      <IconButton label={thread.starred ? 'Remove star' : 'Add star'} aria-pressed={thread.starred} onClick={onStar} className="size-7">
        <Star aria-hidden className={cx('size-4', thread.starred ? 'fill-warn text-warn' : 'text-muted')} />
      </IconButton>
      <Link to={href} aria-current={active ? 'true' : undefined} className={cx('flex min-w-0 flex-1 gap-x-3 py-1', stacked ? 'flex-col' : 'flex-col md:flex-row md:items-center', thread.unread && 'font-semibold')}>
        <span className={cx('flex items-center gap-2', !stacked && 'md:w-44 md:shrink-0')}>
          {thread.unread && <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />}
          <span className="min-w-0 flex-1 truncate">
            {thread.unread && <span className="sr-only">Unread. </span>}
            {who}
            {thread.messages.length > 1 && <span className="ml-1 text-xs font-normal text-muted">{thread.messages.length}</span>}
          </span>
          <time dateTime={last.at} className={cx(timeClass, !stacked && 'md:hidden')}>
            {formatWhen(last.at)}
          </time>
        </span>
        <span className="min-w-0 flex-1 truncate">
          {thread.subject}
          <span className="font-normal text-muted"> — {plainPreview(last.body)}</span>
        </span>
        <span className={cx('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1', !stacked && 'md:max-w-[45%]')}>
          {campaignName && (
            <Badge tone="accent" icon={Megaphone} className="max-w-40 font-normal">
              <span className="truncate">{campaignName}</span>
            </Badge>
          )}
          {hasFiles && (
            <>
              <Paperclip aria-hidden className="size-3.5 text-muted" />
              <span className="sr-only">Has attachments</span>
            </>
          )}
          {showMailbox && (
            // AIDEV-NOTE: Campaign + mailbox metadata wraps in narrow rows; the tooltip keeps the complete address.
            <span title={`Mailbox: ${thread.identityId}`} className="flex min-w-0 max-w-full items-center gap-1.5 text-xs font-normal text-muted">
              <DomainDot domain={domain} />
              <span className="truncate">{mailboxLabel(thread.identityId)}</span>
            </span>
          )}
          <time dateTime={last.at} className={cx(timeClass, 'hidden w-14 text-right', !stacked && 'md:block')}>
            {formatWhen(last.at)}
          </time>
        </span>
      </Link>
      {onArchive && (
        // Pointer and keyboard shortcut for one-at-a-time triage; touch screens use the checkbox and bulk bar instead.
        <IconButton label={`Archive conversation: ${thread.subject}`} onClick={onArchive} className="hidden size-7 opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 md:inline-flex">
          <Archive aria-hidden className="size-4 text-muted" />
        </IconButton>
      )}
    </li>
  )
}

export function DraftRow({ draft }: { draft: Draft }) {
  const deleteDraft = useData((s) => s.deleteDraft)
  const remove = async () => {
    if (await confirm({ title: 'Delete this draft?', body: 'The draft will be permanently deleted.', confirmLabel: 'Delete draft', danger: true })) {
      deleteDraft(draft.id)
      toast('Draft deleted.')
    }
  }
  return (
    <li className="row flex items-center gap-2 border-b border-line pl-3 pr-2 hover:bg-surface-2">
      <button type="button" onClick={() => openDraft(draft)} className="flex min-w-0 flex-1 flex-col gap-x-3 py-1 text-left md:flex-row md:items-center">
        <span className="truncate md:w-48 md:shrink-0">
          <span className="font-medium text-danger">Draft</span> <span className="text-muted">{draft.to[0] ? `to ${draft.to[0]}` : 'no recipient yet'}</span>
        </span>
        <span className="min-w-0 flex-1 truncate">
          {draft.subject || '(no subject)'}
          <span className="text-muted"> — {plainPreview(draft.body) || 'Empty message'}</span>
        </span>
        <time dateTime={draft.updatedAt} className="shrink-0 text-xs tabular-nums text-muted">
          {formatWhen(draft.updatedAt)}
        </time>
      </button>
      <IconButton label={`Delete draft: ${draft.subject || 'no subject'}`} onClick={() => void remove()}>
        <Trash2 aria-hidden className="size-4" />
      </IconButton>
    </li>
  )
}
