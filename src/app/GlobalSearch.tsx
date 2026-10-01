import { Megaphone, Search, User } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useData } from '@/data/store'
import { searchAll, type SearchResults } from '@/domain/activity'
import { lastMessage } from '@/domain/mail'
import { formatWhen } from '@/lib/format'
import { threadHref } from '@/lib/routes'

export function useSearch(query: string): SearchResults {
  const threads = useData((s) => s.threads)
  const contacts = useData((s) => s.contacts)
  const campaigns = useData((s) => s.campaigns)
  return useMemo(() => searchAll({ threads, contacts, campaigns }, query), [threads, contacts, campaigns, query])
}

const groupTitle = 'px-3 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-wide text-muted'
const hit = 'flex items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-surface-2 focus-visible:bg-surface-2'

/** Grouped result lists, shared by the top-bar dropdown (limited) and the full results page. */
export function SearchGroups({ results, limit, onPick }: { results: SearchResults; limit?: number; onPick?(): void }) {
  const take = <T,>(items: T[]) => (limit ? items.slice(0, limit) : items)
  return (
    <>
      {results.threads.length > 0 && (
        <section aria-label="Messages">
          <h3 className={groupTitle}>Messages ({results.threads.length})</h3>
          {take(results.threads).map((t) => (
            <Link key={t.id} to={threadHref(t)} onClick={onPick} className={hit}>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{t.subject}</span>
                <span className="text-muted"> — {lastMessage(t).from.name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{formatWhen(lastMessage(t).at)}</span>
            </Link>
          ))}
        </section>
      )}
      {results.contacts.length > 0 && (
        <section aria-label="Contacts">
          <h3 className={groupTitle}>Contacts ({results.contacts.length})</h3>
          {take(results.contacts).map((c) => (
            <Link key={c.id} to={`/contacts?contact=${c.id}`} onClick={onPick} className={hit}>
              <User aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted"> — {c.company}</span>
              </span>
            </Link>
          ))}
        </section>
      )}
      {results.campaigns.length > 0 && (
        <section aria-label="Campaigns">
          <h3 className={groupTitle}>Campaigns ({results.campaigns.length})</h3>
          {take(results.campaigns).map((c) => (
            <Link key={c.id} to={`/campaigns/${c.id}`} onClick={onPick} className={hit}>
              <Megaphone aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
            </Link>
          ))}
        </section>
      )}
    </>
  )
}

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLFormElement>(null)
  const navigate = useNavigate()
  const results = useSearch(query)
  const showPanel = open && query.trim().length >= 2

  const close = () => setOpen(false)

  return (
    <form
      ref={container}
      role="search"
      className="relative min-w-0 max-w-2xl flex-1"
      onSubmit={(e) => {
        e.preventDefault()
        if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
        close()
      }}
      // Close when focus leaves the whole search widget, not when it moves between input and results.
      onBlur={(e) => !container.current?.contains(e.relatedTarget) && close()}
      onKeyDown={(e) => e.key === 'Escape' && close()}
    >
      <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        aria-label="Search messages, contacts, and campaigns"
        placeholder="Search messages, contacts, campaigns"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        className="h-10 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-sm text-fg placeholder:text-muted"
      />
      {showPanel && (
        <div className="absolute left-0 right-0 top-12 z-30 max-h-[70dvh] overflow-y-auto rounded-xl border border-line bg-surface pb-2 shadow-xl">
          {results.total === 0 ? (
            <p className="px-3 py-4 text-[13px] text-muted">No results for “{query.trim()}”.</p>
          ) : (
            <>
              <SearchGroups results={results} limit={4} onPick={close} />
              <button type="submit" className="mt-1 w-full border-t border-line px-3 pt-2.5 text-left text-[13px] font-medium text-accent-text">
                See all {results.total} results
              </button>
            </>
          )}
        </div>
      )}
    </form>
  )
}
