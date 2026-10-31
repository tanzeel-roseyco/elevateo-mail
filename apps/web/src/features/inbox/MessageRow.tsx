// One 40px Gmail-structured list row in the Flux skin (INBOX-SPEC §2): checkbox, star, unread
// dot, sender (200px), subject – snippet (fluid), date (72px) that hover/focus replaces with quick
// actions. Below 768px the same markup becomes a 72px two-line row with an avatar.
//
// AIDEV-NOTE: Every control here is a real server write supplied by the caller (BE-05 folders,
// snooze, star; BE-02 read state). A caller that cannot write passes no handlers, and the row
// renders no controls rather than disabled placeholders.
import { Link } from 'react-router'
import type { ThreadSummary } from '@/data/contract'
import { isSnoozing } from '@/domain/threadFolders'
import { cx, formatWhen } from '@/lib/format'
import { Avatar } from '@/ui/Avatar'
import { IconButton } from '@/ui/Button'
import { Checkbox } from '@/ui/Field'
import { Menu, MenuHeading, MenuItem, MenuSeparator } from '@/ui/Menu'
import { ClockIcon, EllipsisVerticalIcon, EnvelopeIcon, EnvelopeOpenIcon, StarIcon, StarSolidIcon } from '@/ui/icons'
import { snoozePresets } from '@/domain/threadFolders'
import type { RowAction } from './rowActions'
import { SnoozeMenu } from './SnoozeMenu'

export interface MessageRowProps {
  thread: ThreadSummary
  to: string
  /** Shown instead of the preview tail on search results across mailboxes. */
  mailboxName?: string | undefined
  selected: boolean
  onSelect?: ((checked: boolean) => void) | undefined
  /** Real actor star write; absent when the caller cannot write. */
  onStar?: (() => void) | undefined
  /** Real read-state write; absent when the caller cannot write (no proof). */
  onToggleRead?: (() => void) | undefined
  /** Folder moves offered in the current view, performed by the caller. */
  actions?: readonly RowAction[] | undefined
  onAction?: ((action: RowAction) => void) | undefined
  /** Snooze chooser; absent in views where snoozing makes no sense. */
  onSnooze?: ((snoozedUntil: string | null) => void) | undefined
  /** A write for this thread is in flight: controls stay visible but inert. */
  busy?: boolean | undefined
  current?: boolean | undefined
}

export function senderLabel(thread: ThreadSummary): string {
  // A blank display name is as good as none: fall back to the address before "Unknown sender".
  const name = thread.sender?.display_name?.trim() ?? ''
  if (name !== '') return name
  const address = thread.sender?.address?.trim() ?? ''
  return address !== '' ? address : 'Unknown sender'
}

export function MessageRow({ thread, to, mailboxName, selected, onSelect, onStar, onToggleRead, actions = [], onAction, onSnooze, busy = false, current = false }: MessageRowProps) {
  const sender = senderLabel(thread)
  const subject = thread.subject ?? '(no subject)'
  const unread = thread.unread
  const starred = thread.starred
  const snoozing = isSnoozing(thread.snoozed_until)
  // A snoozed row shows when it returns rather than when it was last active.
  const date = snoozing && thread.snoozed_until !== null ? formatWhen(thread.snoozed_until) : thread.last_message_at === null ? 'No date' : formatWhen(thread.last_message_at)
  const hasActions = onToggleRead !== undefined || onAction !== undefined || onSnooze !== undefined
  // AIDEV-NOTE: Accessible names carry the sender as well as the subject: repeated subjects
  // ("Invoice", "(no subject)") would otherwise produce indistinguishable controls.
  const name = `${subject} from ${sender}`
  return (
    <li
      data-selected={selected || undefined}
      aria-busy={busy || undefined}
      className={cx(
        'group relative flex items-center gap-2 border-b border-line px-2 text-sm last:border-b-0 hover:bg-surface-2  max-md:h-18 md:h-10  ',
        unread ? 'bg-surface ' : 'bg-surface-2 ',
        selected && 'border-s-2 border-s-line bg-surface hover:bg-surface ',
      )}
    >
      {onSelect && (
        <Checkbox aria-label={`Select ${name}`} checked={selected} onChange={(event) => onSelect(event.target.checked)} className="max-md:hidden" />
      )}
      {onStar && (
        <button
          type="button"
          aria-pressed={starred}
          aria-label={starred ? `Unstar ${name}` : `Star ${name}`}
          disabled={busy}
          onClick={onStar}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-muted disabled:opacity-50 "
        >
          {starred ? <StarSolidIcon className="size-5 text-fg" /> : <StarIcon className="size-5" />}
        </button>
      )}
      <Link
        data-thread
        to={to}
        aria-current={current ? 'page' : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-offset-[-2px] max-md:gap-3"
      >
        <Avatar name={sender} size={10} shape="circle" className="md:hidden" />
        <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full bg-fg max-md:hidden', !unread && 'invisible')} />
        {unread && <span className="sr-only">Unread, </span>}
        {starred && !onStar && <span className="sr-only">Starred, </span>}
        <span className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-2">
          <span className="flex items-center justify-between gap-2 md:contents">
            <span className={cx('truncate md:w-50 md:shrink-0', unread ? 'font-semibold text-fg ' : 'text-muted ')}>{sender}</span>
            <span className={cx('shrink-0 text-xs md:hidden', unread ? 'font-semibold text-fg ' : 'text-muted')}>{date}</span>
          </span>
          <span className="block min-w-0 truncate md:flex-1">
            <span className={cx(unread ? 'font-semibold text-fg ' : 'text-muted ')}>
              {subject}
              {thread.subject_truncated && <span title="Subject shortened">…</span>}
            </span>
            {thread.preview_text !== '' && <span className="text-muted "> – {thread.preview_text}</span>}
            {mailboxName !== undefined && <span className="text-muted"> · {mailboxName}</span>}
          </span>
        </span>
        <span className={cx('flex w-18 shrink-0 items-center justify-end gap-1 text-end text-xs max-md:hidden', unread ? 'font-semibold text-fg ' : 'text-muted', hasActions && 'group-focus-within:invisible group-hover:invisible')}>
          {snoozing && <ClockIcon aria-hidden className="size-3.5 text-muted" />}
          {date}
        </span>
      </Link>
      {/* AIDEV-NOTE: Scope action reveal to desktop so hover/focus cannot cover the phone conversation link. */}
      {hasActions && (
        <span className="absolute end-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 bg-inherit md:group-focus-within:flex md:group-hover:flex">
          {onAction && actions.map((action) => (
            <IconButton key={action.key} label={`${action.label} ${name}`} onClick={() => onAction(action)} disabled={busy}>
              <action.Icon className="size-5" />
            </IconButton>
          ))}
          {onToggleRead && (
            <IconButton label={unread ? `Mark ${name} as read` : `Mark ${name} as unread`} onClick={onToggleRead} disabled={busy}>
              {unread ? <EnvelopeOpenIcon className="size-5" /> : <EnvelopeIcon className="size-5" />}
            </IconButton>
          )}
          {onSnooze && <SnoozeMenu label={`Snooze ${name}`} snoozedUntil={thread.snoozed_until} disabled={busy} onSnooze={onSnooze} />}
        </span>
      )}
      {(hasActions || onSelect) && (
        // Phones have no hover: the same writes live in a per-row menu (touch targets, no checkbox).
        <Menu
          label={`Actions for ${name}`}
          align="end"
          className="md:hidden"
          trigger={
            <IconButton label={`Actions for ${name}`} disabled={busy} className="md:hidden">
              <EllipsisVerticalIcon className="size-5" />
            </IconButton>
          }
        >
          <RowMenuItems selected={selected} unread={unread} snoozedUntil={thread.snoozed_until} actions={actions} onSelect={onSelect} onToggleRead={onToggleRead} onAction={onAction} onSnooze={onSnooze} />
        </Menu>
      )}
    </li>
  )
}

interface RowMenuItemsProps {
  selected: boolean
  unread: boolean
  snoozedUntil: string | null
  actions: readonly RowAction[]
  onSelect: MessageRowProps['onSelect']
  onToggleRead: MessageRowProps['onToggleRead']
  onAction: MessageRowProps['onAction']
  onSnooze: MessageRowProps['onSnooze']
}

/** Mounted only while the phone row menu is open, so snooze presets are relative to that moment. */
function RowMenuItems({ selected, unread, snoozedUntil, actions, onSelect, onToggleRead, onAction, onSnooze }: RowMenuItemsProps) {
  const snoozing = isSnoozing(snoozedUntil)
  return (
    <>
      {onSelect && <MenuItem onSelect={() => onSelect(!selected)}>{selected ? 'Deselect' : 'Select'}</MenuItem>}
      {onToggleRead && <MenuItem onSelect={onToggleRead}>{unread ? 'Mark as read' : 'Mark as unread'}</MenuItem>}
      {onAction && actions.map((action) => (
        <MenuItem key={action.key} icon={<action.Icon className="size-4" />} onSelect={() => onAction(action)}>{action.label}</MenuItem>
      ))}
      {onSnooze && (
        <>
          <MenuSeparator />
          <MenuHeading>Snooze until</MenuHeading>
          {snoozePresets().map((preset) => (
            <MenuItem key={preset.key} onSelect={() => onSnooze(preset.at)}>{preset.label}</MenuItem>
          ))}
          {snoozing && <MenuItem onSelect={() => onSnooze(null)}>Remove snooze</MenuItem>}
        </>
      )}
    </>
  )
}

/** Skeleton rows at sender/subject/date widths (INBOX-SPEC "Loading"). */
export function MessageRowSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex h-10 items-center gap-3 px-3">
          <span className="size-4 rounded bg-surface-2 " />
          <span className="h-3 w-40 rounded bg-surface-2 " />
          <span className="h-3 flex-1 rounded bg-surface-2 " />
          <span className="h-3 w-12 rounded bg-surface-2 " />
        </li>
      ))}
    </ul>
  )
}
