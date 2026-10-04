import { Columns2, FileText, Mail, Rows3, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { useMediaQuery, usePrefs } from '@/app/appearance'
import { useData } from '@/data/store'
import { identityDomain } from '@/domain/identities'
import { inFolder, isMailFolder, sortByRecent, threadMatches, type MailFolder, type ThreadFilter } from '@/domain/mail'
import { DOMAIN_NAMES, type StoredFolder, type Thread } from '@/domain/schema'
import { cx } from '@/lib/format'
import { threadHref } from '@/lib/routes'
import { EmptyState, usePageTitle } from '@/ui/Bits'
import { Button, buttonClass, IconButton } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { toast } from '@/ui/toast'
import { ActiveFilters, BulkBar, type FilterChipKey } from './MailListTools'
import { FOLDERS, MailRail } from './MailRail'
import { DraftRow, ThreadRow } from './MailRows'
import { ThreadView } from './ThreadView'

const MOVE_VERB: Record<StoredFolder, string> = { inbox: 'moved to Inbox', sent: 'moved to Sent', archive: 'archived', spam: 'marked as spam', trash: 'moved to Trash' }
const selectClass = 'h-8 max-w-44 rounded-lg border border-line bg-surface px-2 text-[13px]'

// AIDEV-NOTE: Folder, open thread, and every filter live in the URL, so they survive opening/closing a conversation
// and work with back/forward. The list stays mounted while reading; its scroll offset is restored on return.
// Pieces: MailRail (folders + mailbox scope), MailListTools (filter chips / bulk bar), MailRows, ThreadView.
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
  // Sidebar (240) + rail (208) + list (360) leave the reader about 460px at 1280; any narrower and split is unusable,
  // so below that the saved preference is ignored and the toggle is hidden.
  const wide = useMediaQuery('(min-width: 1280px)')
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
  // Drafts honour the search box and the mailbox scope chosen in the rail; the other filters do not apply to them.
  const visibleDrafts = useMemo(() => {
    const q = filter.q.trim().toLowerCase()
    return drafts.filter(
      (d) =>
        (!filter.identityId || d.identityId === filter.identityId) &&
        (!filter.domain || identityDomain(d.identityId) === filter.domain) &&
        (!q || [d.subject, d.body, ...d.to, ...d.cc, ...d.bcc].some((v) => v.toLowerCase().includes(q))),
    )
  }, [drafts, filter.q, filter.domain, filter.identityId])
  const showList = split || !threadId

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    // Changing the domain invalidates an address filter from another domain.
    if (key === 'domain') next.delete('identity')
    setSearch(next, { replace: true })
  }
  const removeFilter = (key: FilterChipKey) => {
    const next = new URLSearchParams(search)
    if (key === 'mailbox') {
      next.delete('domain')
      next.delete('identity')
    } else next.delete(key)
    setSearch(next, { replace: true })
  }
  const clearFilters = () => setSearch({}, { replace: true })
  const query = search.toString() ? `?${search.toString()}` : ''
  const closeThread = () => navigate(`/mail/${folder}${query}`)

  // Newer/older links for the reader walk the list exactly as filtered and sorted, so triage never leaves the reader.
  // A conversation that no longer matches (e.g. just read under "Unread only") has no position, so the links hide.
  const openIndex = openThread ? rows.findIndex((r) => r.id === openThread.id) : -1
  const hrefAt = (index: number) => {
    const row = rows[index]
    return row ? `/mail/${folder}/${row.id}${query}` : undefined
  }
  const readerNav = openIndex >= 0 ? { position: `${openIndex + 1} of ${rows.length}`, newer: hrefAt(openIndex - 1), older: hrefAt(openIndex + 1) } : undefined

  // Selection contract: ticks belong to the list as currently filtered. Any filter or mailbox change drops them, so a
  // hidden row can never stay selected and resurface when filters are cleared. Opening or closing a conversation does
  // not touch the query string, so reading keeps both the selection and the list position.
  const filterKey = search.toString()
  useEffect(() => {
    setSelected(new Set())
  }, [filterKey])

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

  /** The row's own Archive button. Closes the reader too when it was showing that conversation (split view). */
  const archiveRow = (id: string) => {
    move([id], 'archive')
    if (id === threadId) closeThread()
  }

  const patchSelection = (ids: string[], patch: Partial<Pick<Thread, 'unread' | 'starred'>>) => {
    patchThreads(ids, patch)
    setSelected(new Set())
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
      <MailRail folder={folder} filter={filter} search={search} threadOpen={Boolean(threadId)} />

      <div className="flex min-h-0 min-w-0 flex-1">
        <section aria-label={`${folderMeta.label} conversations`} className={cx('min-h-0 flex-col', showList ? 'flex' : 'hidden', split ? 'w-[360px] shrink-0 border-r border-line 2xl:w-[420px]' : 'min-w-0 flex-1')}>
          <div className="flex shrink-0 flex-col gap-2 border-b border-line px-3 py-2.5">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{folderMeta.label}</h1>
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
                {/* From md up the rail's Mailboxes list sets these two parameters, so the selects are phone-only. */}
                <select aria-label="Filter by domain" value={filter.domain} onChange={(e) => setParam('domain', e.target.value)} className={cx(selectClass, 'md:hidden')}>
                  <option value="">All domains</option>
                  {DOMAIN_NAMES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <select aria-label="Filter by address" value={filter.identityId} onChange={(e) => setParam('identity', e.target.value)} className={cx(selectClass, 'md:hidden')}>
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
              </div>
            )}
            {/* One row, two states: filter summary at rest, bulk actions once anything is ticked. Tint marks the switch. */}
            {folder !== 'drafts' && (rows.length > 0 || hasFilters) && (
              <div className={cx('-mx-1 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-1 py-0.5', selectedIds.length > 0 && 'bg-accent-soft')}>
                {rows.length > 0 && (
                  <label className={cx('flex shrink-0 items-center gap-2 pl-0.5 text-[13px]', selectedIds.length > 0 && 'font-semibold')}>
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />
                    {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
                  </label>
                )}
                {selectedIds.length > 0 ? (
                  <BulkBar folder={folder} ids={selectedIds} onMove={move} onDeleteForever={(ids) => void deleteForever(ids)} onPatch={patchSelection} onClear={() => setSelected(new Set())} />
                ) : (
                  <ActiveFilters filter={filter} campaignName={campaignNames.get(filter.campaign)} count={rows.length} onRemove={removeFilter} onClear={clearFilters} />
                )}
              </div>
            )}
          </div>

          <div ref={listRef} onScroll={(e) => (scrollTop.current = e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto" data-testid="mail-list">
            {folder === 'drafts' ? (
              drafts.length === 0 ? (
                <EmptyState icon={FileText} title="No drafts" body={folderMeta.empty} />
              ) : visibleDrafts.length === 0 ? (
                <EmptyState icon={Search} title="No drafts match" body="Try a different search or mailbox." action={<Button onClick={clearFilters}>Clear search</Button>} />
              ) : (
                <ul>
                  {visibleDrafts.map((d) => (
                    <DraftRow key={d.id} draft={d} />
                  ))}
                </ul>
              )
            ) : rows.length === 0 ? (
              hasFilters ? (
                <EmptyState icon={Search} title="No conversations match" body="Try a different search or remove some filters." action={<Button onClick={clearFilters}>Clear filters</Button>} />
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
                    showMailbox={!filter.identityId}
                    campaignName={t.campaignId ? campaignNames.get(t.campaignId) : undefined}
                    onSelect={() => toggleOne(t.id)}
                    onStar={() => patchThreads([t.id], { starred: !t.starred })}
                    // Starred and Sent are views over every folder, so only offer Archive where it would change something.
                    onArchive={t.folder === 'inbox' ? () => archiveRow(t.id) : undefined}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {(threadId || split) && (
          <section aria-label="Conversation" className="min-h-0 min-w-0 flex-1">
            {openThread ? (
              <ThreadView key={openThread.id} thread={openThread} split={split} nav={readerNav} onClose={closeThread} onMove={move} />
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
