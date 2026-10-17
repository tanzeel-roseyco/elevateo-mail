// BE-02 D §9 scoped literal search: the query and scope live in the URL, an invalid query is
// refused locally, results are inert ThreadSummary rows linking into the reader, metacharacters
// are literal, and an unavailable scope or an outage is shown as such.
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '@/app/session'
import { GatewayError } from '@/data/errors'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createFixtureGateway, type FixtureScript } from '@/data/fixtures/fixtureGateway'
import type { MailroomGateway } from '@/data/gateway'
import { SearchPage } from './SearchPage'

const INBOX = '00000000-0000-4000-8000-000000000021'
const INBOX_THREAD = '00000000-0000-4000-8000-000000000031'

function renderSearch(entry: string, gateway: MailroomGateway = createFixtureGateway()) {
  return render(
    <SessionProvider gateway={gateway}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
          <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<p>reader</p>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}
const scripted = (script: FixtureScript) => createFixtureGateway(script)
const resultLinks = () => screen.getAllByRole('link').filter((a) => a.hasAttribute('data-thread'))

describe('search page', () => {
  it('without a query it explains literal matching and runs nothing', async () => {
    renderSearch('/search')
    expect(await screen.findByText('Search your mail')).toBeTruthy()
    expect(screen.getByText('Literal text match')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('refuses a whitespace-only query locally', async () => {
    renderSearch('/search?q=%20%E3%80%80%20')
    expect(await screen.findByText('That search cannot be run')).toBeTruthy()
    expect(screen.getByText('Enter between 1 and 256 characters, not only spaces.')).toBeTruthy()
  })

  it('lists literal matches across mailboxes as inert rows linking into the reader', async () => {
    const { container } = renderSearch('/search?q=%3Cimg')
    expect((await screen.findAllByRole('link')).length).toBeGreaterThan(0)
    const links = resultLinks()
    expect(links.map((a) => a.getAttribute('href')).sort()).toEqual([`/mailboxes/${INBOX}/threads/${INBOX_THREAD}`, `/mailboxes/${CD.mailboxId}/threads/${CD.threadId}`].sort())
    expect(container.querySelector('img, script')).toBeNull()
    expect(screen.getByText(/“<img” in all your mailboxes/)).toBeTruthy()
    expect(screen.getByText(/Synthetic thread/)).toBeTruthy()
  })

  it('scopes to one mailbox and treats metacharacters literally', async () => {
    renderSearch(`/search?q=C%2FD%20fixture%20thread&mailbox=${CD.mailboxId}`)
    expect(await screen.findByText(/Synthetic thread/)).toBeTruthy()
    expect(resultLinks()).toHaveLength(1)
    expect(resultLinks()[0]?.getAttribute('href')).toBe(`/mailboxes/${CD.mailboxId}/threads/${CD.threadId}`)

    renderSearch('/search?q=%25')
    expect(await screen.findByText('No matches')).toBeTruthy()
  })

  it('an unavailable scope and an outage are distinct states, and the outage retries', async () => {
    renderSearch(`/search?q=x&mailbox=${CD.mailboxId}`, scripted({ searchMail: 'not_available' }))
    expect(await screen.findByText('This mailbox is unavailable')).toBeTruthy()

    let failing = true
    const base = createFixtureGateway()
    const flaky: MailroomGateway = {
      ...base,
      searchMail: async (ctx, query, signal) => {
        if (failing) {
          failing = false
          throw new GatewayError('api', 'temporarily_unavailable', 'synthetic', { status: 503, requestId: 'r1' })
        }
        return base.searchMail(ctx, query, signal)
      },
    }
    renderSearch('/search?q=plaintext', flaky)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The search could not be completed')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/Synthetic thread/)).toBeTruthy()
  })
})
