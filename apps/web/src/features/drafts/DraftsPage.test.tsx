import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '@/app/session'
import type { DraftPage } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import type { MailroomGateway } from '@/data/gateway'
import { DraftsPage } from './DraftsPage'

function renderDrafts(gateway: MailroomGateway) {
  return render(
    <SessionProvider gateway={gateway}>
      <MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/drafts`]}>
        <Routes><Route path="/mailboxes/:mailboxId/drafts" element={<DraftsPage />} /></Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

function cursorHarness() {
  const base = createFixtureGateway()
  const cursors: Array<string | undefined> = []
  let firstPages = 0
  const gateway: MailroomGateway = {
    ...base,
    listDrafts: async (ctx, mailboxId, query, signal): Promise<DraftPage> => {
      cursors.push(query.cursor)
      if (query.cursor !== undefined) {
        throw new GatewayError('api', 'cursor_invalid', 'synthetic', { status: 400, requestId: 'r1' })
      }
      firstPages += 1
      const page = await base.listDrafts(ctx, mailboxId, query, signal)
      return { ...page, items: page.items.map((draft) => ({ ...draft, subject: `Traversal ${firstPages}` })), next_cursor: 'expired-cursor' }
    },
  }
  return { gateway, cursors }
}

const showMore = () => fireEvent.click(screen.getByRole('button', { name: 'Show more drafts' }))

describe('draft pagination recovery', () => {
  it('replaces rows once after cursor expiry, then stops automatic recovery until explicit retry', async () => {
    const h = cursorHarness()
    renderDrafts(h.gateway)
    await screen.findByRole('link', { name: /Traversal 1/ })
    showMore()
    await screen.findByRole('link', { name: /Traversal 2/ })
    expect(screen.queryByRole('link', { name: /Traversal 1/ })).toBeNull()
    expect(h.cursors).toEqual([undefined, 'expired-cursor', undefined])

    showMore()
    await screen.findByRole('heading', { name: 'Drafts could not be loaded' })
    expect(h.cursors).toEqual([undefined, 'expired-cursor', undefined, 'expired-cursor'])
    expect(screen.queryByRole('link', { name: /Traversal 3/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: /Traversal 3/ })
    showMore()
    await screen.findByRole('link', { name: /Traversal 4/ })
    expect(h.cursors).toEqual([undefined, 'expired-cursor', undefined, 'expired-cursor', undefined, 'expired-cursor', undefined])
  })

  it('lists saved drafts and follows a valid continuation without restarting', async () => {
    const base = createFixtureGateway()
    const cursors: Array<string | undefined> = []
    const gateway: MailroomGateway = {
      ...base,
      listDrafts: async (ctx, mailboxId, query, signal) => {
        cursors.push(query.cursor)
        const page = await base.listDrafts(ctx, mailboxId, query, signal)
        return query.cursor === undefined ? { ...page, next_cursor: 'next-page' } : { ...page, items: [], next_cursor: null }
      },
    }
    renderDrafts(gateway)
    await screen.findByRole('link', { name: /Fixture draft/ })
    showMore()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show more drafts' })).toBeNull())
    expect(screen.getByRole('link', { name: /Fixture draft/ })).toBeTruthy()
    expect(cursors).toEqual([undefined, 'next-page'])
  })
})
