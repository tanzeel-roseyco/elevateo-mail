// Help centre: collections render from content.ts, search is literal and case-insensitive, and
// "Copy for LLM" copies the article as Markdown (or reports the failure inline).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HelpRoutes } from './HelpRoutes'
import { ARTICLES, COLLECTIONS, articleToMarkdown, findArticle, searchArticles } from './content'

function renderHelp(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/help/*" element={<HelpRoutes />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

function BackButton() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => void navigate(-1)}>history back</button>
}

describe('help search history', () => {
  it('updates the search field when the browser goes back to an earlier query', async () => {
    render(
      <MemoryRouter initialEntries={['/help/search?q=draft', '/help/search?q=consent']} initialIndex={1}>
        <BackButton />
        <Routes>
          <Route path="/help/*" element={<HelpRoutes />} />
        </Routes>
      </MemoryRouter>,
    )
    const field = screen.getByRole('searchbox', { name: 'Search help articles' }) as HTMLInputElement
    expect(field.value).toBe('consent')
    fireEvent.click(screen.getByRole('button', { name: 'history back' }))
    await waitFor(() => expect((screen.getByRole('searchbox', { name: 'Search help articles' }) as HTMLInputElement).value).toBe('draft'))
  })

  it('a search followed by an immediate Back in the same batch restores the earlier query', async () => {
    render(
      <MemoryRouter initialEntries={['/help/search?q=consent']}>
        <BackButton />
        <Routes>
          <Route path="/help/*" element={<HelpRoutes />} />
        </Routes>
      </MemoryRouter>,
    )
    const field = screen.getByRole('searchbox', { name: 'Search help articles' }) as HTMLInputElement
    fireEvent.change(field, { target: { value: 'draft' } })
    // One act: the forward navigation and the Back commit together, so `q` ends where it started.
    act(() => {
      fireEvent.submit(field.closest('form')!)
      fireEvent.click(screen.getByRole('button', { name: 'history back' }))
    })
    await waitFor(() => expect((screen.getByRole('searchbox', { name: 'Search help articles' }) as HTMLInputElement).value).toBe('consent'))
  })
})

describe('help centre', () => {
  it('lists every collection on the home page and keeps articles bound to a known collection', () => {
    renderHelp('/help')
    const list = screen.getByRole('list', { name: 'Collections' })
    expect(within(list).getAllByRole('link')).toHaveLength(COLLECTIONS.length)
    const known = new Set(COLLECTIONS.map((c) => c.slug))
    for (const article of ARTICLES) expect(known.has(article.collection)).toBe(true)
    expect(screen.getByRole('search', { name: 'Search help articles' })).toBeTruthy()
  })

  it('searches literally and case-insensitively, with an empty state for no match', () => {
    expect(searchArticles('CONSENT').map((a) => a.slug)).toContain('consent-evidence')
    expect(searchArticles('   ')).toEqual([])
    renderHelp('/help/search?q=zzz-no-such-topic')
    expect(screen.getByText('No articles match')).toBeTruthy()
  })

  it('renders an article with its breadcrumb and copies it as Markdown for an LLM', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderHelp('/help/articles/keyboard-shortcuts')
    expect(screen.getByRole('heading', { name: 'Which keyboard shortcuts work in the inbox?', level: 1 })).toBeTruthy()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Inbox and Conversations' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copy for LLM' }))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
    const article = findArticle('keyboard-shortcuts')!
    expect(writeText).toHaveBeenCalledWith(articleToMarkdown(article))
    expect(articleToMarkdown(article).startsWith('# Which keyboard shortcuts')).toBe(true)
  })

  it('shows the not-found state for an unknown article slug', () => {
    renderHelp('/help/articles/does-not-exist')
    expect(screen.getByText('This article does not exist')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse collections' }).getAttribute('href')).toBe('/help')
  })
})
