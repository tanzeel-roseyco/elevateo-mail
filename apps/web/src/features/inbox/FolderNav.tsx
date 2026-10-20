// Gmail folder column in the Flux navlist skin (INBOX-SPEC §1–2): mailbox picker, gold Compose,
// then Inbox / Unread / Starred / Drafts / Members. Folders the backend does not provide (Sent,
// Snoozed, Spam, Trash) are listed disabled as "Not available yet" rather than hidden, so the
// structure matches the reference without inventing data.
//
// AIDEV-NOTE: "Starred" is a per-device mark (see starStore.ts); the label says so. Drafts and
// Members follow the mailbox capabilities the server reported; an unknown capability hides the link.
import type { ComponentType, SVGProps } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { Mailbox } from '@/data/contract'
import { useMailboxes } from '@/app/mailboxes'
import { cx } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Select } from '@/ui/Field'
import {
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InboxIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  StarIcon,
  TrashIcon,
  UserGroupIcon,
} from '@/ui/icons'
import { composeDraftPath, parseView, type InboxCounts } from './inboxContext'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

interface Folder {
  readonly key: string
  readonly label: string
  readonly to: string
  readonly Icon: Icon
  readonly current: boolean
  /** Parent highlight (thread open inside this folder) without aria-current. */
  readonly within: boolean
  readonly badge?: string | undefined
  readonly title?: string | undefined
}

const UNSUPPORTED: ReadonlyArray<{ label: string; Icon: Icon }> = [
  { label: 'Sent', Icon: PaperAirplaneIcon },
  { label: 'Snoozed', Icon: ClockIcon },
  { label: 'Spam', Icon: ExclamationTriangleIcon },
  { label: 'Trash', Icon: TrashIcon },
]

const ITEM =
  'my-px flex h-8 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium text-zinc-500 hover:bg-zinc-800/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
const CURRENT = 'border-zinc-200 bg-white text-zinc-800 shadow-xs dark:border-white/10 dark:bg-white/10 dark:text-white'

export function useFolders(mailboxId: string, mailbox: Mailbox | undefined, counts: InboxCounts | null): readonly Folder[] {
  const { pathname, search } = useLocation()
  const base = `/mailboxes/${mailboxId}`
  const view = parseView(new URLSearchParams(search).get('filter'))
  const onList = pathname === base
  const inThread = pathname.startsWith(`${base}/threads/`)
  const folders: Folder[] = [
    { key: 'inbox', label: 'Inbox', to: base, Icon: InboxIcon, current: onList && view === 'all', within: inThread && view === 'all', badge: counts?.unread },
    { key: 'unread', label: 'Unread', to: `${base}?filter=unread`, Icon: EnvelopeIcon, current: onList && view === 'unread', within: inThread && view === 'unread' },
    { key: 'starred', label: 'Starred', to: `${base}?filter=starred`, Icon: StarIcon, current: onList && view === 'starred', within: inThread && view === 'starred', title: 'Starred on this device only' },
  ]
  if (mailbox?.capabilities.compose === true) {
    folders.push({ key: 'drafts', label: 'Drafts', to: `${base}/drafts`, Icon: DocumentTextIcon, current: pathname === `${base}/drafts`, within: pathname.startsWith(`${base}/drafts/`) })
  }
  if (mailbox?.capabilities.manage_members === true) {
    folders.push({ key: 'members', label: 'Members', to: `${base}/members`, Icon: UserGroupIcon, current: pathname === `${base}/members`, within: false })
  }
  return folders
}

function MailboxPicker({ mailboxId, className }: { mailboxId: string; className?: string }) {
  const snapshot = useMailboxes()
  const navigate = useNavigate()
  if (snapshot.status !== 'ready' || snapshot.mailboxes.length < 2) return null
  return (
    <Select aria-label="Mailbox" value={mailboxId} onChange={(event) => navigate(`/mailboxes/${event.target.value}`)} className={className}>
      {snapshot.mailboxes.map((m) => (
        <option key={m.id} value={m.id}>{m.display_name}</option>
      ))}
    </Select>
  )
}

function ComposeButton({ mailbox, mailboxId, className }: { mailbox: Mailbox | undefined; mailboxId: string; className?: string }) {
  const navigate = useNavigate()
  const canCompose = mailbox?.capabilities.compose === true
  return (
    <Button
      variant="primary"
      icon={<PencilSquareIcon className="size-5" />}
      className={cx('justify-center', className)}
      disabled={!canCompose}
      title={canCompose ? undefined : 'Composing is not available in this mailbox'}
      onClick={() => navigate(composeDraftPath(mailboxId))}
    >
      Compose
    </Button>
  )
}

interface FolderNavProps {
  mailboxId: string
  mailbox: Mailbox | undefined
  counts: InboxCounts | null
}

/** Desktop folder column (≥ lg). */
export function FolderColumn({ mailboxId, mailbox, counts }: FolderNavProps) {
  const folders = useFolders(mailboxId, mailbox, counts)
  return (
    <div className="flex w-60 shrink-0 flex-col gap-4 border-e border-zinc-200 pe-4 dark:border-zinc-700">
      <MailboxPicker mailboxId={mailboxId} />
      <ComposeButton mailbox={mailbox} mailboxId={mailboxId} />
      <nav aria-label="Folders">
        <ul className="flex flex-col">
          {folders.map((folder) => (
            <li key={folder.key}>
              <Link
                to={folder.to}
                aria-current={folder.current ? 'page' : undefined}
                data-current={folder.current || folder.within || undefined}
                title={folder.title}
                className={cx(ITEM, (folder.current || folder.within) && CURRENT)}
              >
                <folder.Icon aria-hidden className={cx('size-5 shrink-0', (folder.current || folder.within) && 'text-(--color-accent-content)')} />
                <span className="flex-1 truncate">{folder.label}</span>
                {folder.badge !== undefined && (
                  <span className="rounded-md bg-gold-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-gold-800 dark:bg-gold-400/20 dark:text-gold-200" aria-label={`${folder.badge} unread`}>
                    {folder.badge}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 px-3 pb-1 text-xs font-medium text-zinc-400">Not available yet</p>
        <ul className="flex flex-col" aria-label="Folders not available yet">
          {UNSUPPORTED.map(({ label, Icon }) => (
            <li key={label}>
              <span aria-disabled="true" title="Not available yet" className={cx(ITEM, 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-zinc-500')}>
                <Icon aria-hidden className="size-5 shrink-0" />
                <span className="flex-1 truncate">{label}</span>
              </span>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** Tablet replacement for the column (768–1023px): a folder select beside Compose. */
export function FolderSelect({ mailboxId, mailbox, counts }: FolderNavProps) {
  const folders = useFolders(mailboxId, mailbox, counts)
  const navigate = useNavigate()
  const current = folders.find((f) => f.current || f.within) ?? folders[0]
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <MailboxPicker mailboxId={mailboxId} className="max-w-xs" />
      <Select aria-label="Folder" value={current?.key ?? 'inbox'} onChange={(event) => { const next = folders.find((f) => f.key === event.target.value); if (next) navigate(next.to) }} className="max-w-xs">
        {folders.map((folder) => (
          <option key={folder.key} value={folder.key}>{folder.label}{folder.badge !== undefined ? ` (${folder.badge})` : ''}</option>
        ))}
      </Select>
      <ComposeButton mailbox={mailbox} mailboxId={mailboxId} className="max-md:hidden" />
    </div>
  )
}

/** Phone floating action button (< 768px). */
export function ComposeFab({ mailboxId, mailbox }: { mailboxId: string; mailbox: Mailbox | undefined }) {
  const navigate = useNavigate()
  if (mailbox?.capabilities.compose !== true) return null
  return (
    <button
      type="button"
      aria-label="Compose"
      onClick={() => navigate(composeDraftPath(mailboxId))}
      className="fixed bottom-6 end-6 z-20 flex size-14 items-center justify-center rounded-full bg-(--color-accent) text-(--color-accent-foreground) shadow-lg hover:bg-gold-400 md:hidden"
    >
      <PencilSquareIcon className="size-6" />
    </button>
  )
}

