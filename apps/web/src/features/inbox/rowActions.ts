// Which folder moves a conversation offers in each view (Gmail conventions): the inbox views
// archive/spam/delete, Archive restores to inbox, Spam offers "Not spam", Trash only restores.
// Snooze and star are separate controls; read/unread is always available.
//
// AIDEV-NOTE: There is no "delete forever": the contract has no permanent deletion, so Trash
// keeps conversations until a future retention rule exists. Do not add a fake control for it.
import type { ComponentType, SVGProps } from 'react'
import type { ThreadFolder } from '@/data/contract'
import type { ThreadView } from '@/domain/threadFolders'
import { ArchiveBoxIcon, ClockIcon, ExclamationTriangleIcon, InboxIcon, TrashIcon } from '@/ui/icons'

export type FolderMove = { kind: 'folder'; folder: ThreadFolder } | { kind: 'unsnooze' }

export interface RowAction {
  readonly key: string
  readonly label: string
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>
  readonly move: FolderMove
  /** Single-key shortcut while a row has focus (Gmail: e archive, ! spam, # delete). */
  readonly shortcut?: string
}

const ARCHIVE: RowAction = { key: 'archive', label: 'Archive', Icon: ArchiveBoxIcon, move: { kind: 'folder', folder: 'archive' }, shortcut: 'e' }
const SPAM: RowAction = { key: 'spam', label: 'Report spam', Icon: ExclamationTriangleIcon, move: { kind: 'folder', folder: 'spam' }, shortcut: '!' }
const DELETE: RowAction = { key: 'trash', label: 'Delete', Icon: TrashIcon, move: { kind: 'folder', folder: 'trash' }, shortcut: '#' }
const TO_INBOX: RowAction = { key: 'inbox', label: 'Move to inbox', Icon: InboxIcon, move: { kind: 'folder', folder: 'inbox' } }
const NOT_SPAM: RowAction = { ...TO_INBOX, label: 'Not spam' }
const RESTORE: RowAction = { ...TO_INBOX, label: 'Restore to inbox' }
const UNSNOOZE: RowAction = { key: 'unsnooze', label: 'Remove snooze', Icon: ClockIcon, move: { kind: 'unsnooze' } }

export function folderActionsFor(view: ThreadView): readonly RowAction[] {
  switch (view) {
    case 'snoozed':
      return [UNSNOOZE, ARCHIVE, SPAM, DELETE]
    case 'archive':
      return [TO_INBOX, SPAM, DELETE]
    case 'spam':
      return [NOT_SPAM, DELETE]
    case 'trash':
      return [RESTORE]
    default:
      return [ARCHIVE, SPAM, DELETE]
  }
}

/** Snoozing from spam or trash makes no sense (it would also move the thread back to the inbox). */
export function canSnoozeIn(view: ThreadView): boolean {
  return view !== 'spam' && view !== 'trash'
}
