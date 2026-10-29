// Gmail folder column in the Flux navlist skin (INBOX-SPEC §1–2): mailbox picker, gold Compose,
// then Inbox / Unread / Starred / Snoozed / Archive / Spam / Trash / Drafts / Members. The one
// folder the backend still does not provide (Sent) is listed disabled as "Not available yet"
// rather than hidden, so the structure matches the reference without inventing data.
//
// AIDEV-NOTE: Every listed folder is a server view (BE-05); the URL `filter` query carries it.
// Drafts and Members follow the mailbox capabilities the server reported; an unknown capability
// hides the link.
import type { ComponentType, SVGProps } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { Mailbox } from '@/data/contract'
import { useMailboxes } from '@/app/mailboxes'
import { cx } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Select } from '@/ui/Field'
import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InboxIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  StarIcon,
  TrashIcon,
  UserGroupIcon,
} from '@/ui/icons'
import { composeDraftPath, parseView, viewPath, VIEW_LABELS, type InboxCounts, type InboxView } from './inboxContext'

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
}

const VIEW_ICONS: Record<InboxView, Icon> = {
  all: InboxIcon,
  unread: EnvelopeIcon,
  starred: StarIcon,
  snoozed: ClockIcon,
  archive: ArchiveBoxIcon,
  spam: ExclamationTriangleIcon,
  trash: TrashIcon,
}
const VIEW_ORDER: readonly InboxView[] = ['all', 'unread', 'starred', 'snoozed', 'archive', 'spam', 'trash']

const UNSUPPORTED: ReadonlyArray<{ label: string; Icon: Icon }> = [{ label: 'Sent', Icon: PaperAirplaneIcon }]

const ITEM =
  'my-px flex h-8 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium text-zinc-500 hover:bg-zinc-800/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
const CURRENT = 'border-zinc-200 bg-white text-zinc-800 shadow-xs dark:border-white/10 dark:bg-white/10 dark:text-white'

export function useFolders(mailboxId: string, mailbox: Mailbox | undefined, counts: InboxCounts | null): readonly Folder[] {
  const { pathname, search } = useLocation()
  const base = `/mailboxes/${mailboxId}`
  const view = parseView(new URLSearchParams(search).get('filter'))
  const onList = pathname === base
  const inThread = pathname.startsWith(`${base}/threads/`)
  const folders: Folder[] = VIEW_ORDER.map((key) => ({
    key,
    label: VIEW_LABELS[key],
    to: viewPath(mailboxId, key),
    Icon: VIEW_ICONS[key],
    current: onList && view === key,
    within: inThread && view === key,
    badge: key === 'all' ? counts?.unread : undefined,
  }))
  if (mailbox?.capabilities.compose === true) {
    folders.push({ key: 'drafts', label: 'Drafts', to: `${base}/drafts`, Icon: DocumentTextIcon, current: pathname === `${base}/drafts`, within: pathname.startsWith(`${base}/drafts/`) })
  }
  if (mailbox?.capabilities.manage_members === true) {
    folders.push({ key: 'members', label: 'Members', to: `${base}/members`, Icon: UserGroupIcon, current: pathname === `${base}/members`, within: false })
  }
  // Send-delivery reports: visible to any mailbox member; the pages show an unavailable state when
  // the server does not expose delivery reports, so the links stay stable rather than appearing/vanishing.
  folders.push({ key: 'bounces', label: 'Bounces', to: `${base}/bounces`, Icon: ArrowUturnLeftIcon, current: pathname === `${base}/bounces`, within: false })
  folders.push({ key: 'suppressions', label: 'Suppressions', to: `${base}/suppressions`, Icon: ShieldCheckIcon, current: pathname === `${base}/suppressions`, within: false })
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

// AIDEV-NOTE: Column, tablet row and phone FAB each carry a compose control; CSS shows one at a time.
// The tablet/phone copies take the longer accessible name so the column button is the single "Compose".
function ComposeButton({ mailbox, mailboxId, className, label }: { mailbox: Mailbox | undefined; mailboxId: string; className?: string; label?: string }) {
  const navigate = useNavigate()
  const canCompose = mailbox?.capabilities.compose === true
  return (
    <Button
      aria-label={label}
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
      <Select aria-label="Folder" value={current?.key ?? 'all'} onChange={(event) => { const next = folders.find((f) => f.key === event.target.value); if (next) navigate(next.to) }} className="max-w-xs">
        {folders.map((folder) => (
          <option key={folder.key} value={folder.key}>{folder.label}{folder.badge !== undefined ? ` (${folder.badge})` : ''}</option>
        ))}
      </Select>
      <ComposeButton mailbox={mailbox} mailboxId={mailboxId} className="max-md:hidden" label="Compose a new draft" />
    </div>
  )
}

/** Phone floating action button (< 768px). */
export function ComposeFab({ mailboxId, mailbox }: { mailboxId: string; mailbox: Mailbox | undefined }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // AIDEV-NOTE: Shared measured inset protects notices; hide inside drafts to protect editor footer controls.
  const editingDraft = pathname.replace(/\/+$/, '').startsWith(`/mailboxes/${mailboxId}/drafts/`)
  if (mailbox?.capabilities.compose !== true || editingDraft) return null
  return (
    <button
      type="button"
      aria-label="Compose a new draft"
      onClick={() => navigate(composeDraftPath(mailboxId))}
      className="fixed end-6 bottom-[calc(1.5rem+var(--bottom-notices))] z-20 flex size-14 items-center justify-center rounded-full bg-(--color-accent) text-(--color-accent-foreground) shadow-lg hover:bg-gold-400 md:hidden"
    >
      <PencilSquareIcon className="size-6" />
    </button>
  )
}
