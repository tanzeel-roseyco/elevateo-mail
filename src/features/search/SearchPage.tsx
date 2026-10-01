import { Search } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { SearchGroups, useSearch } from '@/app/GlobalSearch'
import { EmptyState, PageHeader, usePageTitle } from '@/ui/Bits'

/** Full grouped results for the global search box (`/search?q=`). */
export function SearchPage() {
  const [search] = useSearchParams()
  const query = search.get('q') ?? ''
  const results = useSearch(query)
  usePageTitle(query ? `Search: ${query}` : 'Search')

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title="Search results" description={query ? `${results.total} result${results.total === 1 ? '' : 's'} for “${query}”` : undefined} />
      {query.trim().length < 2 ? (
        <EmptyState icon={Search} title="Search the mailroom" body="Type at least two characters in the search box above to find messages, contacts, and campaigns." />
      ) : results.total === 0 ? (
        <EmptyState icon={Search} title="No results" body={`Nothing matches “${query}”. Check the spelling or try a shorter term.`} />
      ) : (
        <div className="pb-4 md:px-3">
          {/* Capped per group so a broad term cannot render thousands of rows; counts in the headings stay exact. */}
          <SearchGroups results={results} limit={100} />
        </div>
      )}
    </div>
  )
}
