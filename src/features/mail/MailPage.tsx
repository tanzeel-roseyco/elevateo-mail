import { Archive, Columns2, FileText, Inbox, Mail, MailOpen, Megaphone, Paperclip, Rows3, Search, Send, ShieldAlert, Star, Trash2, X, type LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { useMediaQuery, usePrefs } from '@/app/appearance'
import { useData } from '@/data/store'
import { inFolder, isMailFolder, lastMessage, sortByRecent, threadMatches, type MailFolder, type ThreadFilter } from '@/domain/mail'
import { plainPreview } from '@/domain/richText'
import { DOMAIN_NAMES, type Draft, type StoredFolder, type Thread } from '@/domain/schema'
import { openDraft } from '@/features/compose/composerStore'
import { cx, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { EmptyState, usePageTitle } from '@/ui/Bits'
import { Button, buttonClass, IconButton } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { toast } from '@/ui/toast'
import { ThreadView } from './ThreadView'
import { threadHref } from '@/lib/routes'

const FOLDERS: Array<{ id: MailFolder; label: string; icon: LucideIcon; empty: string }> = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, empty: 'New replies and messages to any of your nine addresses arrive here.' },
  { id: 'starred', label: 'Starred', icon: Star, empty: 'Star conversations you want to find again quickly.' },
  { id: 'sent', label: 'Sent', icon: Send, empty: 'Conversations you have written in appear here.' },
  { id: 'drafts', label: 'Drafts', icon: FileText, empty: 'Messages you start are saved here automatically.' },
  { id: 'archive', label: 'Archive', icon: Archive, empty: 'Archived conversations stay searchable here.' },
  { id: 'spam', label: 'Spam', icon: ShieldAlert, empty: 'Nothing has been marked as spam.' },
  { id: 'trash', label: 'Trash', icon: Trash2, empty: 'Trash is empty.' },
]

const MOVE_VERB: Record<StoredFolder, string> = { inbox: 'moved to Inbox', sent: 'moved to Sent', archive: 'archived', spam: 'marked as spam', trash: 'moved to Trash' }
const selectClass = 'h-8 max-w-44 rounded-lg border border-line bg-surface px-2 text-[13px]'

function ThreadRow({ thread, href, stacked, selected, active, sentView, onSelect, onStar, campaignName }: { thread: Thread; href: string; stacked: boolean; selected: boolean; active: boolean; sentView: boolean; onSelect(): void; onStar(): void; campaignName?: string }) {
  const last = lastMessage(thread)
  // Sent shows who we wrote to; everywhere else shows who wrote to us (or our recipient if we spoke last).
  // In Sent the newest message may be their reply addressed to us, so read our own latest message instead.
  const lastOutbound = [...thread.messages].reverse().find((m) => m.direction === 'out')
  const firstRecipient = (sentView ? (lastOutbound ?? last) : last).to[0]
  const who = sentView || last.direction === 'out' ? `To: ${firstRecipient?.name ?? 'unknown'}` : last.from.name
  const hasFiles = thread.messages.some((m) => m.attachments.length > 0)
  return (
    <li className={cx('row group flex items-start gap-1 border-b border-line pl-2 pr-3', active ? 'bg-accent-soft' : selected ? 'bg-accent-soft/60' : thread.unread ? 'bg-surface' : 'bg-surface-2/60', 'hover:shadow-[inset_0_0_0_1px_var(--line)]')}>
      <input type="checkbox" aria-label={`Select conversation: ${thread.subject}`} checked={selected} onChange={onSelect} className="mt-1.5 size-4 shrink-0 accent-[var(--accent)]" />
      <IconButton label={thread.starred ? 'Remove star' : 'Add star'} aria-pressed={thread.starred} onClick={onStar} className="size-7">
        <Star aria-hidden className={cx('size-4', thread.starred ? 'fill-warn text-warn' : 'text-muted')} />
      </IconButton>
      <Link to={href} aria-current={active ? 'true' : undefined} className={cx('flex min-w-0 flex-1 gap-x-3 py-1', stacked ? 'flex-col' : 'flex-col md:flex-row md:items-center', thread.unread && 'font-semibold')}>
        <span className={cx('flex items-center gap-2', !stacked && 'md:w-48 md:shrink-0')}>
          {thread.unread && <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />}
          <span className="min-w-0 flex-1 truncate">
            {thread.unread && <span className="sr-only">Unread. </span>}
            {who}
            {thread.messages.length > 1 && <span className="ml-1 text-xs font-normal text-muted">{thread.messages.length}</span>}
          </span>
          <time dateTime={last.at} className={cx('shrink-0 text-xs', !stacked && 'md:hidden', thread.unread ? 'text-fg' : 'font-normal text-muted')}>
            {formatWhen(last.at)}
          </time>
        </span>
        <span className="min-w-0 flex-1 truncate">
          {thread.subject}
          <span className="font-normal text-muted"> — {plainPreview(last.body)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
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
          <time dateTime={last.at} className={cx('hidden w-14 text-right text-xs', !stacked && 'md:block', thread.unread ? 'text-fg' : 'font-normal text-muted')}>
            {formatWhen(last.at)}
          </time>
        </span>
      </Link>
    </li>
  )
}

function DraftRow({ draft }: { draft: Draft }) {
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
        <time dateTime={draft.updatedAt} className="shrink-0 text-xs text-muted">
          {formatWhen(draft.updatedAt)}
        </time>
      </button>
      <IconButton label={`Delete draft: ${draft.subject || 'no subject'}`} onClick={() => void remove()}>
        <Trash2 aria-hidden className="size-4" />
      </IconButton>
    </li>
  )
}

// AIDEV-NOTE: Folder, open thread, and every filter live in the URL, so they survive opening/closing a conversation
// and work with back/forward. The list stays mounted while reading; its scroll offset is restored on return.
export function MailPage() {
  const params = useParams()
  const folder: MailFolder = isMailFolder(params.folder) ? params.folder : 'inbox'
  const threadId = params.threadId
  const [search, setSearch] = useSearchParams()
  const navigate = useNavigate()

  const threads = useData((s) => s.threads)
  const drafts = useData((s) => s.drafts)
  const identities = useData((s) => s.identities)
  const campaigns = useData((s) => s.campaigns)
  const patchThreads = useData((s) => s.patchThreads)
  const restoreFolders = useData((s) => s.restoreFolders)
  const deleteThreads = useData((s) => s.deleteThreads)
  const prefs = usePrefs((s) => s.prefs)
  const savePrefs = usePrefs((s) => s.save)
  const wide = useMediaQuery('(min-width: 1024px)')
  const split = prefs.inboxLayout === 'split' && wide

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const scrollTop = useRef(0)

  const folderMeta = FOLDERS.find((f) => f.id === folder)!
  usePageTitle(folderMeta.label)

  const filter: ThreadFilter = useMemo(
    () => ({
      folder,
      q: search.get('q') ?? '',
      domain: DOMAIN_NAMES.find((d) => d === search.get('domain')) ?? '',
      identityId: search.get('identity') ?? '',
      unread: search.get('unread') === '1',
      campaign: search.get('campaign') ?? '',
    }),
    [folder, search],
  )
  const hasFilters = Boolean(filter.q || filter.domain || filter.identityId || filter.unread || filter.campaign)

  const rows = useMemo(() => sortByRecent(threads.filter((t) => threadMatches(t, filter))), [threads, filter])
  const campaignNames = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name])), [campaigns])
  const routeThread = threadId ? threads.find((t) => t.id === threadId) : undefined
  // A stale or hand-typed link can name a thread that lives elsewhere; never show it under the wrong folder.
  const openThread = routeThread && inFolder(routeThread, folder) ? routeThread : undefined
  const visibleDrafts = useMemo(() => {
    const q = filter.q.trim().toLowerCase()
    return q ? drafts.filter((d) => [d.subject, d.body, ...d.to, ...d.cc, ...d.bcc].some((v) => v.toLowerCase().includes(q))) : drafts
  }, [drafts, filter.q])
  const showList = split || !threadId

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    // Changing the domain invalidates an address filter from another domain.
    if (key === 'domain') next.delete('identity')
    setSearch(next, { replace: true })
  }
  const query = search.toString() ? `?${search.toString()}` : ''
  const closeThread = () => navigate(`/mail/${folder}${query}`)

  // A different folder is a different list: start at the top with nothing selected.
  useEffect(() => {
    setSelected(new Set())
    scrollTop.current = 0
    if (listRef.current) listRef.current.scrollTop = 0
  }, [folder])

  // The single-pane list is display:none while reading, which drops its scroll offset; put it back on return.
  useLayoutEffect(() => {
    if (showList && listRef.current) listRef.current.scrollTop = scrollTop.current
  }, [showList])

  const counts = useMemo(() => {
    const unread = (f: MailFolder) => threads.filter((t) => inFolder(t, f) && t.unread).length
    return { inbox: unread('inbox'), spam: unread('spam'), drafts: drafts.length } as Partial<Record<MailFolder, number>>
  }, [threads, drafts])

  const move = (ids: string[], target: StoredFolder) => {
    const previous = Object.fromEntries(threads.filter((t) => ids.includes(t.id)).map((t) => [t.id, t.folder]))
    patchThreads(ids, { folder: target })
    setSelected(new Set())
    toast(`${ids.length === 1 ? 'Conversation' : `${ids.length} conversations`} ${MOVE_VERB[target]}.`, { action: { label: 'Undo', run: () => restoreFolders(previous) } })
  }

  const deleteForever = async (ids: string[]) => {
    if (!(await confirm({ title: `Delete ${ids.length === 1 ? 'this conversation' : `${ids.length} conversations`} forever?`, body: 'This permanently removes them from the prototype data. It cannot be undone.', confirmLabel: 'Delete forever', danger: true }))) return
    deleteThreads(ids)
    setSelected(new Set())
    toast('Deleted forever.')
  }

  const selectedIds = [...selected].filter((id) => rows.some((r) => r.id === id))
  const allSelected = rows.length > 0 && selectedIds.length === rows.length
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  if (!isMailFolder(params.folder)) return <Navigate to="/mail/inbox" replace />

  const identityOptions = identities.filter((i) => !filter.domain || i.domain === filter.domain)

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* On small screens an open conversation takes the whole pane, so the folder strip steps aside. */}
      <nav aria-label="Mail folders" className={cx('shrink-0 gap-1 overflow-x-auto border-b border-line p-2 md:flex md:w-44 md:flex-col md:overflow-visible md:border-b-0 md:border-r', threadId ? 'hidden' : 'flex')}>
        {FOLDERS.map((f) => {
          const count = counts[f.id] ?? 0
          const current = f.id === folder
          return (
            <Link key={f.id} to={`/mail/${f.id}`} aria-current={current ? 'page' : undefined} className={cx('flex h-8 shrink-0 items-center gap-2.5 rounded-full px-3 text-[13px]', current ? 'bg-accent-soft font-semibold text-accent-text' : 'hover:bg-surface-2', count > 0 && !current && 'font-semibold')}>
              <f.icon aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">{f.label}</span>
              {count > 0 && (
                <span className="text-xs">
                  {count}
                  <span className="sr-only">{f.id === 'drafts' ? ' drafts' : ' unread'}</span>
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1">
        <section aria-label={`${folderMeta.label} conversations`} className={cx('min-h-0 flex-col', showList ? 'flex' : 'hidden', split ? 'w-[420px] shrink-0 border-r border-line' : 'min-w-0 flex-1')}>
          <div className="flex shrink-0 flex-col gap-2 border-b border-line px-3 py-2">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold">{folderMeta.label}</h1>
              <div className="relative ml-auto min-w-0 max-w-xs flex-1">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <input type="search" aria-label="Search mail by sender, recipient, subject, or content" placeholder="Search mail" value={filter.q} onChange={(e) => setParam('q', e.target.value)} className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-[13px]" />
              </div>
              {wide && (
                <IconButton label={prefs.inboxLayout === 'split' ? 'Switch to list view' : 'Switch to split view'} onClick={() => savePrefs({ ...prefs, inboxLayout: prefs.inboxLayout === 'split' ? 'list' : 'split' })}>
                  {prefs.inboxLayout === 'split' ? <Rows3 aria-hidden className="size-4" /> : <Columns2 aria-hidden className="size-4" />}
                </IconButton>
              )}
            </div>
            {folder !== 'drafts' && (
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Filter by domain" value={filter.domain} onChange={(e) => setParam('domain', e.target.value)} className={selectClass}>
                  <option value="">All domains</option>
                  {DOMAIN_NAMES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <select aria-label="Filter by address" value={filter.identityId} onChange={(e) => setParam('identity', e.target.value)} className={selectClass}>
                  <option value="">All addresses</option>
                  {identityOptions.map((i) => (
                    <option key={i.id}>{i.id}</option>
                  ))}
                </select>
                <select aria-label="Filter by campaign" value={filter.campaign} onChange={(e) => setParam('campaign', e.target.value)} className={selectClass}>
                  <option value="">All mail</option>
                  <option value="none">Ordinary messages</option>
                  <option value="any">Any campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button type="button" aria-pressed={filter.unread} onClick={() => setParam('unread', filter.unread ? '' : '1')} className={cx('h-8 rounded-lg border px-2.5 text-[13px]', filter.unread ? 'border-accent-text bg-accent-soft font-semibold text-accent-text' : 'border-line')}>
                  Unread only
                </button>
                {hasFilters && (
                  <button type="button" onClick={() => setSearch({}, { replace: true })} className="flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-accent-text underline">
                    <X aria-hidden className="size-3.5" />
                    Clear filters
                  </button>
                )}
              </div>
            )}
            {folder !== 'drafts' && rows.length > 0 && (
              <div className="flex min-h-8 flex-wrap items-center gap-1">
                <label className="flex items-center gap-2 pl-0.5 pr-2 text-[13px]">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />
                  {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
                </label>
                {selectedIds.length > 0 && (
                  <div role="toolbar" aria-label="Bulk actions" className="flex flex-wrap items-center gap-1">
                    {folder === 'trash' || folder === 'spam' || folder === 'archive' ? (
                      <Button size="sm" icon={<Inbox aria-hidden className="size-3.5" />} onClick={() => move(selectedIds, 'inbox')}>
                        Move to inbox
                      </Button>
                    ) : (
                      <Button size="sm" icon={<Archive aria-hidden className="size-3.5" />} onClick={() => move(selectedIds, 'archive')}>
                        Archive
                      </Button>
                    )}
                    {folder === 'trash' ? (
                      <Button size="sm" variant="danger" icon={<Trash2 aria-hidden className="size-3.5" />} onClick={() => void deleteForever(selectedIds)}>
                        Delete forever
                      </Button>
                    ) : (
                      <Button size="sm" icon={<Trash2 aria-hidden className="size-3.5" />} onClick={() => move(selectedIds, 'trash')}>
                        Trash
                      </Button>
                    )}
                    <Button size="sm" icon={<MailOpen aria-hidden className="size-3.5" />} onClick={() => { patchThreads(selectedIds, { unread: false }); setSelected(new Set()) }}>
                      Mark read
                    </Button>
                    <Button size="sm" icon={<Mail aria-hidden className="size-3.5" />} onClick={() => { patchThreads(selectedIds, { unread: true }); setSelected(new Set()) }}>
                      Mark unread
                    </Button>
                    <Button size="sm" icon={<Star aria-hidden className="size-3.5" />} onClick={() => { patchThreads(selectedIds, { starred: true }); setSelected(new Set()) }}>
                      Star
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div ref={listRef} onScroll={(e) => (scrollTop.current = e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto" data-testid="mail-list">
            {folder === 'drafts' ? (
              drafts.length === 0 ? (
                <EmptyState icon={FileText} title="No drafts" body={folderMeta.empty} />
              ) : visibleDrafts.length === 0 ? (
                <EmptyState icon={Search} title="No drafts match" body="Try a different search." action={<Button onClick={() => setSearch({}, { replace: true })}>Clear search</Button>} />
              ) : (
                <ul>
                  {visibleDrafts.map((d) => (
                    <DraftRow key={d.id} draft={d} />
                  ))}
                </ul>
              )
            ) : rows.length === 0 ? (
              hasFilters ? (
                <EmptyState icon={Search} title="No conversations match" body="Try a different search or remove some filters." action={<Button onClick={() => setSearch({}, { replace: true })}>Clear filters</Button>} />
              ) : (
                <EmptyState icon={folderMeta.icon} title={`Nothing in ${folderMeta.label}`} body={folderMeta.empty} />
              )
            ) : (
              <ul>
                {rows.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    href={`/mail/${folder}/${t.id}${query}`}
                    stacked={split}
                    selected={selected.has(t.id)}
                    active={t.id === threadId}
                    sentView={folder === 'sent'}
                    onSelect={() => toggleOne(t.id)}
                    onStar={() => patchThreads([t.id], { starred: !t.starred })}
                    campaignName={t.campaignId ? campaignNames.get(t.campaignId) : undefined}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {(threadId || split) && (
          <section aria-label="Conversation" className="min-h-0 min-w-0 flex-1">
            {openThread ? (
              <ThreadView key={openThread.id} thread={openThread} split={split} onClose={closeThread} onMove={move} />
            ) : routeThread ? (
              <EmptyState
                icon={Mail}
                title={`This conversation is not in ${folderMeta.label}`}
                body="It has been moved to another folder."
                action={
                  <Link to={`${threadHref(routeThread)}${query}`} replace className={buttonClass()}>
                    Open it in {FOLDERS.find((f) => f.id === routeThread.folder)?.label ?? 'its folder'}
                  </Link>
                }
              />
            ) : threadId ? (
              <EmptyState icon={Mail} title="Conversation not found" body="It may have been deleted." action={<Button onClick={closeThread}>Back to {folderMeta.label}</Button>} />
            ) : (
              <EmptyState icon={Mail} title="Select a conversation" body="Choose a message from the list to read it here." />
            )}
          </section>
        )}
      </div>
    </div>
  )
}
