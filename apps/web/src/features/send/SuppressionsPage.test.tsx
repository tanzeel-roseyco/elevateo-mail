import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { FeatureGatewaysProvider } from '@/app/featureGateways'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { GatewayError } from '@/data/errors'
import type { DeliveryReportsGateway, SuppressionRecord } from '@/data/deliveryReportsContract'
import { SuppressionsPage } from './SuppressionsPage'

const REC: SuppressionRecord = { id: CD.draftId, address: 'annoyed@example.invalid', reason: 'complaint', since: '2026-10-20T07:40:00Z', source_send_id: CD.draftId, removable: false }

function renderPage(port: DeliveryReportsGateway | undefined, query = '') {
  render(
    <SessionProvider gateway={createFixtureGateway()}>
      <FeatureGatewaysProvider value={port === undefined ? {} : { deliveryReports: port }}>
        <MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/suppressions${query}`]}>
          <Routes><Route path="/mailboxes/:mailboxId/suppressions" element={<SuppressionsPage />} /></Routes>
        </MemoryRouter>
      </FeatureGatewaysProvider>
    </SessionProvider>,
  )
}
function port(extra: Partial<DeliveryReportsGateway> = {}): DeliveryReportsGateway {
  return { simulated: true, listBounces: vi.fn(async () => { throw new Error('unused') }), listSuppressions: vi.fn(async (_ctx, organizationId) => ({ context_id: CD.contextId, authorization_version: CD.authorizationVersion, organization_id: organizationId, items: [REC], next_cursor: null })), ...extra }
}

describe('SuppressionsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders the suppression list and passes the URL search to the port', async () => {
    const p = port()
    renderPage(p, '?q=annoyed')
    expect(await screen.findByText('annoyed@example.invalid')).toBeTruthy()
    expect(screen.getByText('Spam complaint')).toBeTruthy()
    expect(p.listSuppressions).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({ q: 'annoyed' }), expect.any(AbortSignal))
  })

  it('shows an error with retry when the list fails to load', async () => {
    renderPage(port({ listSuppressions: vi.fn(async () => { throw new GatewayError('transport', 'network', 'down') }) }))
    expect(await screen.findByText('Suppressions could not be loaded')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('shows an honest unavailable state in production without support', async () => {
    renderPage(undefined)
    expect(await screen.findByText('Suppressions are not available yet')).toBeTruthy()
  })
})
