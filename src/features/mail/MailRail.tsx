import { Archive, FileText, Inbox, Layers, Send, ShieldAlert, Star, Trash2, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useData } from '@/data/store'
import { identityDomain } from '@/domain/identities'
import { inFolder, type MailFolder, type ThreadFilter } from '@/domain/mail'
import { DOMAIN_NAMES, type DomainName } from '@/domain/schema'
import { cx } from '@/lib/format'
import { DomainDot } from '@/ui/Bits'

export const FOLDERS: Array<{ id: MailFolder; label: string; icon: LucideIcon; empty: string }> = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, empty: 'New replies and messages to any of your nine addresses arrive here.' },
  { id: 'starred', label: 'Starred', icon: Star, empty: 'Star conversations you want to find again quickly.' },
  { id: 'sent', label: 'Sent', icon: Send, empty: 'Conversations you have written in appear here.' },
  { id: 'drafts', label: 'Drafts', icon: FileText, empty: 'Messages you start are saved here automatically.' },
  { id: 'archive', label: 'Archive', icon: Archive, empty: 'Archived conversations stay searchable here.' },
  { id: 'spam', label: 'Spam', icon: ShieldAlert, empty: 'Nothing has been marked as spam.' },
  { id: 'trash', label: 'Trash', icon: Trash2, empty: 'Trash is empty.' },
]

const railLink = 'flex h-8 shrink-0 items-center gap-2.5 rounded-lg px-3 text-[13px]'
const railState = (current: boolean) => (current ? 'bg-accent-soft font-semibold text-accent-text' : 'hover:bg-surface-2')

function Count({ value, noun }: { value: number; noun: string }) {
  if (value === 0) return null
  return (
    <span className="text-xs tabular-nums">
      {value}
      <span className="sr-only"> {noun}</span>
    </span>
  )
}

interface Props {
  folder: MailFolder
  filter: ThreadFilter
  search: URLSearchParams
  /** On small screens an open conversation takes the whole pane, so the rail steps aside. */
  threadOpen: boolean
}

// AIDEV-NOTE: Folders + mailbox switcher. A mailbox is a scope (?domain=/&identity=) that follows you across folders;
// every other filter resets on a folder change. Mailbox links are plain URLs, so Back and deep links restore the scope.
export function MailRail({ folder, filter, search, threadOpen }: Props) {
  const threads = useData((s) => s.threads)
  const identities = useData((s) => s.identities)
  const drafts = useData((s) => s.drafts)

  // Folder links keep the mailbox scope, so their badges count inside that scope too: the number must match what the
  // link opens. Search, unread and campaign filters are transient and reset on a folder change, so they are ignored.
  const folderCounts = useMemo(() => {
    const inScope = (identityId: string) => (!filter.identityId || identityId === filter.identityId) && (!filter.domain || identityDomain(identityId) === filter.domain)
    const unread = (f: MailFolder) => threads.filter((t) => inFolder(t, f) && t.unread && inScope(t.identityId)).length
    return { inbox: unread('inbox'), spam: unread('spam'), drafts: drafts.filter((d) => inScope(d.identityId)).length } as Partial<Record<MailFolder, number>>
  }, [threads, drafts, filter.domain, filter.identityId])

  // Unread inbox conversations per receiving address; domain totals are summed from these.
  const unreadByIdentity = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of threads) if (t.folder === 'inbox' && t.unread) counts.set(t.identityId, (counts.get(t.identityId) ?? 0) + 1)
    return counts
  }, [threads])
  const unreadIn = (domain: DomainName) => identities.reduce((n, i) => n + (i.domain === domain ? (unreadByIdentity.get(i.id) ?? 0) : 0), 0)

  // An address filter implies its domain, so a deep link carrying only ?identity= still opens the right group.
  const activeDomain = filter.domain || identityDomain(filter.identityId) || ''
  const scoped = Boolean(activeDomain || filter.identityId)

  const scope = new URLSearchParams()
  if (filter.domain) scope.set('domain', filter.domain)
  if (filter.identityId) scope.set('identity', filter.identityId)
  const scopeQuery = scope.toString() ? `?${scope.toString()}` : ''

  /** Same folder and filters, different mailbox. Leaves any open conversation: it may not belong to the new scope. */
  const mailboxHref = (domain: DomainName | '', identityId = '') => {
    const next = new URLSearchParams(search)
    next.delete('domain')
    next.delete('identity')
    if (domain) next.set('domain', domain)
    if (identityId) next.set('identity', identityId)
    return `/mail/${folder}${next.toString() ? `?${next.toString()}` : ''}`
  }

  return (
    <div className={cx('shrink-0 border-b border-line md:block md:w-52 md:overflow-y-auto md:border-b-0 md:border-r', threadOpen && 'hidden')}>
      <nav aria-label="Mail folders" className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible">
        {FOLDERS.map((f) => {
          const count = folderCounts[f.id] ?? 0
          const current = f.id === folder
          return (
            <Link key={f.id} to={`/mail/${f.id}${scopeQuery}`} aria-current={current ? 'page' : undefined} className={cx(railLink, railState(current), count > 0 && !current && 'font-semibold')}>
              <f.icon aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">{f.label}</span>
              <Count value={count} noun={f.id === 'drafts' ? 'drafts' : 'unread'} />
            </Link>
          )
        })}
      </nav>

      {/* Phones switch mailbox with the selects in the list header; the rail version needs the width. */}
      <nav aria-label="Mailboxes" className="hidden border-t border-line p-2 md:block">
        <p aria-hidden className="eyebrow px-3 pb-1.5 pt-1">
          Mailboxes
        </p>
        <ul className="flex flex-col gap-0.5">
          <li>
            <Link to={mailboxHref('')} aria-current={!scoped ? 'true' : undefined} className={cx(railLink, railState(!scoped))}>
              <Layers aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">All mailboxes</span>
            </Link>
          </li>
          {DOMAIN_NAMES.map((domain) => {
            const open = activeDomain === domain
            const wholeDomain = open && !filter.identityId
            return (
              <li key={domain}>
                <Link to={mailboxHref(domain)} aria-current={wholeDomain ? 'true' : undefined} className={cx(railLink, railState(wholeDomain))}>
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    <DomainDot domain={domain} className="size-2.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{domain}</span>
                  <Count value={unreadIn(domain)} noun="unread" />
                </Link>
                {open && (
                  <ul className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-line pl-1.5">
                    {identities
                      .filter((i) => i.domain === domain)
                      .map((i) => {
                        const current = filter.identityId === i.id
                        return (
                          <li key={i.id}>
                            <Link to={mailboxHref(domain, i.id)} title={i.id} aria-current={current ? 'true' : undefined} className={cx(railLink, 'h-7 px-2', railState(current))}>
                              {/* The domain is the parent row; repeating it visually would only truncate the local part. */}
                              <span className="min-w-0 flex-1 truncate">
                                {i.local}@<span className="sr-only">{domain}</span>
                              </span>
                              <Count value={unreadByIdentity.get(i.id) ?? 0} noun="unread" />
                            </Link>
                          </li>
                        )
                      })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
