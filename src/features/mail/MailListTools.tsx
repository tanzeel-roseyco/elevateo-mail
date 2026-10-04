import { Archive, Inbox, Mail, MailOpen, Star, Trash2, X } from 'lucide-react'
import type { MailFolder, ThreadFilter } from '@/domain/mail'
import type { StoredFolder, Thread } from '@/domain/schema'
import { Button, IconButton } from '@/ui/Button'

// AIDEV-NOTE: The list header's second row: what is filtered (chips) or, once rows are ticked, what can be done (bulk bar).

/** `mailbox` covers both the domain and the address parameter: they are one scope to the user. */
export type FilterChipKey = 'q' | 'mailbox' | 'unread' | 'campaign'

interface ActiveFiltersProps {
  filter: ThreadFilter
  /** Name of the campaign behind a campaign-id filter, when it still exists. */
  campaignName?: string
  count: number
  onRemove(key: FilterChipKey): void
  onClear(): void
}

function campaignLabel(value: string, name?: string): string {
  if (value === 'any') return 'Any campaign'
  if (value === 'none') return 'Ordinary messages'
  return name ?? 'Deleted campaign'
}

/** Every active filter as a removable chip, so a short list is never mistaken for an empty mailbox. */
export function ActiveFilters({ filter, campaignName, count, onRemove, onClear }: ActiveFiltersProps) {
  const chips: Array<{ key: FilterChipKey; label: string }> = []
  if (filter.identityId || filter.domain) chips.push({ key: 'mailbox', label: `Mailbox: ${filter.identityId || filter.domain}` })
  if (filter.q) chips.push({ key: 'q', label: `Search: “${filter.q}”` })
  if (filter.unread) chips.push({ key: 'unread', label: 'Unread only' })
  if (filter.campaign) chips.push({ key: 'campaign', label: campaignLabel(filter.campaign, campaignName) })

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[13px]">
      <span aria-live="polite" className="tabular-nums text-muted">
        {count} {count === 1 ? 'conversation' : 'conversations'}
      </span>
      {chips.map((chip) => (
        <button key={chip.key} type="button" aria-label={`Remove filter: ${chip.label}`} title="Remove this filter" onClick={() => onRemove(chip.key)} className="flex h-6 max-w-56 items-center gap-1 rounded-md border border-accent-text/30 bg-accent-soft pl-2 pr-1 text-xs font-medium text-accent-text">
          <span className="truncate">{chip.label}</span>
          <X aria-hidden className="size-3.5 shrink-0" />
        </button>
      ))}
      {chips.length > 0 && (
        <button type="button" onClick={onClear} className="h-6 rounded-md px-1.5 text-xs font-medium text-accent-text underline underline-offset-2">
          Clear filters
        </button>
      )}
    </div>
  )
}

interface BulkBarProps {
  folder: MailFolder
  ids: string[]
  onMove(ids: string[], target: StoredFolder): void
  onDeleteForever(ids: string[]): void
  /** Applies a flag change to the selection and clears it. */
  onPatch(ids: string[], patch: Partial<Pick<Thread, 'unread' | 'starred'>>): void
  onClear(): void
}

/** Replaces the filter summary while rows are ticked, so the actions appear exactly where the eye already is. */
export function BulkBar({ folder, ids, onMove, onDeleteForever, onPatch, onClear }: BulkBarProps) {
  const icon = 'size-3.5'
  return (
    <div role="toolbar" aria-label="Bulk actions" className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
      {folder === 'trash' || folder === 'spam' || folder === 'archive' ? (
        <Button size="sm" icon={<Inbox aria-hidden className={icon} />} onClick={() => onMove(ids, 'inbox')}>
          Move to inbox
        </Button>
      ) : (
        <Button size="sm" icon={<Archive aria-hidden className={icon} />} onClick={() => onMove(ids, 'archive')}>
          Archive
        </Button>
      )}
      {folder === 'trash' ? (
        <Button size="sm" variant="danger" icon={<Trash2 aria-hidden className={icon} />} onClick={() => onDeleteForever(ids)}>
          Delete forever
        </Button>
      ) : (
        <Button size="sm" icon={<Trash2 aria-hidden className={icon} />} onClick={() => onMove(ids, 'trash')}>
          Trash
        </Button>
      )}
      <Button size="sm" icon={<MailOpen aria-hidden className={icon} />} onClick={() => onPatch(ids, { unread: false })}>
        Mark read
      </Button>
      <Button size="sm" icon={<Mail aria-hidden className={icon} />} onClick={() => onPatch(ids, { unread: true })}>
        Mark unread
      </Button>
      <Button size="sm" icon={<Star aria-hidden className={icon} />} onClick={() => onPatch(ids, { starred: true })}>
        Star
      </Button>
      <IconButton label="Clear selection" onClick={onClear} className="ml-auto size-7">
        <X aria-hidden className="size-4" />
      </IconButton>
    </div>
  )
}
