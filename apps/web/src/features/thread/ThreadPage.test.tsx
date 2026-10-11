// R5: hostile HTML/script/URL/CSS strings display inertly with no remote fetch. R4: zero-message
// conversations render, truncation is visible, and message continuation is a separate control.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { createFixtureGateway, type FixtureScript } from '@/data/fixtures/fixtureGateway'
import { ThreadPage } from './ThreadPage'

const MB = '00000000-0000-4000-8000-000000000021'
const THREAD = '00000000-0000-4000-8000-000000000031'

function renderReader(script: FixtureScript = {}) {
  return render(
    <SessionProvider gateway={createFixtureGateway(script)}>
      <MemoryRouter initialEntries={[`/mailboxes/${MB}/threads/${THREAD}`]}>
        <Routes>
          <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadPage />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('plaintext reader', () => {
  it('renders hostile content inertly and performs no network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { container } = renderReader({ getThread: 'thread_hostile_plaintext' })
    await screen.findByText(/alert\(1\)/)
    // The script/img/link markup is visible text, not elements; nothing is autolinked or fetched.
    expect(container.querySelector('article script')).toBeNull()
    expect(container.querySelector('article img')).toBeNull()
    expect(container.querySelector('a[href*="example.invalid"]')).toBeNull()
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(screen.getByText('(no subject)')).toBeTruthy()
    expect(screen.getByText('Unknown sender')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders a zero-message conversation without indexing the last element', async () => {
    renderReader({ getThread: 'thread_empty' })
    await screen.findByText('No messages')
  })

  it('shows truncation honestly and a separate message continuation control', async () => {
    renderReader({ getThread: 'thread_truncated' })
    await screen.findByText('Message shortened by the server')
    expect(screen.getByRole('button', { name: 'Show more messages' })).toBeTruthy()
  })

  it('shows the same unavailable UI for absent or inaccessible conversations', async () => {
    renderReader({ getThread: 'not_available' })
    await screen.findByText('This conversation is unavailable')
  })
})
