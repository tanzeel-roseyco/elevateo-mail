import { lazy, useState, type ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageBoundary } from './PageBoundary'

afterEach(() => vi.restoreAllMocks())

describe('page loading and recovery', () => {
  it('keeps navigation available while a page downloads, then renders it', async () => {
    let finish: ((page: { default: () => ReactNode }) => void) | undefined
    const Page = lazy(() => new Promise<{ default: () => ReactNode }>((resolve) => { finish = resolve }))
    render(<MemoryRouter><Link to="/inbox">Inbox</Link><PageBoundary><Page /></PageBoundary></MemoryRouter>)
    expect(screen.getByRole('status').textContent).toBe('Loading page…')
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeTruthy()
    await act(async () => { finish?.({ default: () => <h1>Page loaded</h1> }) })
    expect(await screen.findByRole('heading', { name: 'Page loaded' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('handles a failed download without exposing diagnostics and permits another route', async () => {
    // AIDEV-NOTE: React reports caught render errors to stderr; the user-facing fallback stays redacted.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const BrokenPage = lazy(() => Promise.reject(new Error('private deployment diagnostic')))
    render(
      <MemoryRouter initialEntries={['/broken']}>
        <Link to="/inbox">Inbox</Link>
        <PageBoundary><Routes>
          <Route path="/broken" element={<BrokenPage />} />
          <Route path="/inbox" element={<h1>Working inbox</h1>} />
        </Routes></PageBoundary>
      </MemoryRouter>,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('This page could not open')
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy()
    expect(screen.queryByText(/private deployment diagnostic/)).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Inbox' }))
    expect(await screen.findByRole('heading', { name: 'Working inbox' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps unsaved page state when only URL search filters change', () => {
    function Editor() {
      const [value, setValue] = useState('')
      return <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />
    }
    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <Link to="/inbox?filter=unread">Unread</Link>
        <PageBoundary><Editor /></PageBoundary>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: 'Unsaved text' } })
    fireEvent.click(screen.getByRole('link', { name: 'Unread' }))
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveProperty('value', 'Unsaved text')
  })

  it('does not resurrect a delayed page after its protected subtree is removed', async () => {
    let finish: ((page: { default: () => ReactNode }) => void) | undefined
    const Page = lazy(() => new Promise<{ default: () => ReactNode }>((resolve) => { finish = resolve }))
    const view = render(<MemoryRouter><PageBoundary><Page /></PageBoundary></MemoryRouter>)
    expect(screen.getByRole('status')).toBeTruthy()
    view.rerender(<MemoryRouter><h1>Sign in</h1></MemoryRouter>)
    await act(async () => { finish?.({ default: () => <h1>Protected message</h1> }) })
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Protected message' })).toBeNull()
  })
})
