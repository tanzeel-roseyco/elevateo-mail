import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { FeatureGatewaysProvider } from '@/app/featureGateways'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { GatewayError } from '@/data/errors'
import type { BounceRecord, DeliveryReportsGateway } from '@/data/deliveryReportsContract'
import { BouncesPage } from './BouncesPage'

const HARD: BounceRecord = { id: CD.draftId, send_id: CD.draftId, thread_id: CD.threadId, recipient: 'nobody@example.invalid', provider_event: 'bounced', bounce_type: 'hard', reason: '550 5.1.1 user unknown', occurred_at: '2026-10-27T09:12:00Z' }

function renderPage(port: DeliveryReportsGateway | undefined, query = '') {
  render(
    <SessionProvider gateway={createFixtureGateway()}>
      <FeatureGatewaysProvider value={port === undefined ? {} : { deliveryReports: port }}>
        <MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/bounces${query}`]}>
          <Routes><Route path="/mailboxes/:mailboxId/bounces" element={<BouncesPage />} /></Routes>
        </MemoryRouter>
      </FeatureGatewaysProvider>
    </SessionProvider>,
  )
}
function port(extra: Partial<DeliveryReportsGateway> = {}): DeliveryReportsGateway {
  return { simulated: true, listBounces: vi.fn(async (_ctx, mailboxId) => ({ context_id: CD.contextId, authorization_version: CD.authorizationVersion, mailbox_id: mailboxId, items: [HARD], next_cursor: null })), listSuppressions: vi.fn(async () => { throw new Error('unused') }), ...extra }
}

describe('BouncesPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders the bounce list and passes the URL type filter to the port', async () => {
    const p = port()
    renderPage(p, '?type=hard')
    expect(await screen.findByText('nobody@example.invalid')).toBeTruthy()
    expect(screen.getByText('Hard bounce')).toBeTruthy()
    expect(screen.getByText('550 5.1.1 user unknown')).toBeTruthy()
    expect(p.listBounces).toHaveBeenCalledWith(expect.anything(), CD.mailboxId, expect.objectContaining({ type: 'hard' }), expect.any(AbortSignal))
  })

  it('shows an error with retry when the list fails to load', async () => {
    renderPage(port({ listBounces: vi.fn(async () => { throw new GatewayError('transport', 'network', 'down') }) }))
    expect(await screen.findByText('Bounces could not be loaded')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('shows the empty state when there are no bounces', async () => {
    renderPage(port({ listBounces: vi.fn(async (_ctx, mailboxId) => ({ context_id: CD.contextId, authorization_version: CD.authorizationVersion, mailbox_id: mailboxId, items: [], next_cursor: null })) }))
    expect(await screen.findByText('No bounces in this view')).toBeTruthy()
  })

  it('shows an honest unavailable state when the port is absent', async () => {
    renderPage(undefined)
    expect(await screen.findByText('Bounces are not available yet')).toBeTruthy()
  })
})
