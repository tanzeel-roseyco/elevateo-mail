import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { FeatureGatewaysProvider } from '@/app/featureGateways'
import { MailboxesProvider } from '@/app/mailboxes'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { createV2OutreachGateway } from '@/data/v2OutreachGateway'
import { GatewayError } from '@/data/errors'
import { RunIntentProvider } from './RunIntent'
import { CampaignRunsPage } from './CampaignRunsPage'
import type { OutreachGateway } from './contract'

const id = '00000000-0000-4000-8000-000000000001'
const run = { id, campaign_id: id, mailbox_id: id, operation_id: id, state: 'queued', subject: 'Newsletter', body_text: 'Hello',
  created_at: '2026-10-20T00:00:00Z', simulated: true, recipients: [{ lead_id: id, email: 'reader@example.test', draft_id: id, send_id: id, state: 'queued', delivery_state: null }] }
function mount(outreach?: OutreachGateway) {
  const gateway = createFixtureGateway()
  const refresh = vi.spyOn(gateway, 'refreshSession')
  render(<SessionProvider gateway={gateway}><RunIntentProvider><MailboxesProvider value={{ status: 'ready', mailboxes: [] }}><FeatureGatewaysProvider value={outreach ? { outreach } : {}}>
    <MemoryRouter initialEntries={[`/outreach/campaigns/${id}/runs`]}><Routes><Route path="/outreach/campaigns/:campaignId/runs" element={<CampaignRunsPage />} /></Routes></MemoryRouter>
  </FeatureGatewaysProvider></MailboxesProvider></RunIntentProvider></SessionProvider>)
  return refresh
}
function port(): OutreachGateway {
  return { ...createV2OutreachGateway(), getCampaign: async () => ({ id, name: 'October', status: 'draft', version: 1 }),
    listLeads: async () => ({ items: [], next_cursor: null }), listCampaignRuns: async () => ({ items: [run], next_cursor: null }) }
}

// AIDEV-NOTE: Run-control state and per-recipient send state are separate; cancellation does not promise recall.
describe('campaign run history', () => {
  it('labels missing capabilities without presenting a sending form', async () => {
    mount()
    expect(await screen.findByText(/Campaign runs are unavailable in this connection/)).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Create marketing run' })).toBeNull()
  })
  it('loads validated history and refreshes after an explicit cancellation', async () => {
    const gateway = port()
    const cancel = vi.fn<NonNullable<OutreachGateway['cancelCampaignRun']>>(async () => ({ ...run, state: 'cancelled' }))
    const list = vi.fn<NonNullable<OutreachGateway['listCampaignRuns']>>()
      .mockResolvedValueOnce({ items: [run], next_cursor: null }).mockResolvedValue({ items: [{ ...run, state: 'cancelled' }], next_cursor: null })
    mount({ ...gateway, listCampaignRuns: list, cancelCampaignRun: cancel })
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel remaining sends' }))
    await screen.findByText(/Cancellation requested/)
    expect(cancel.mock.calls[0]?.[4]).toEqual({ operation_id: id })
    expect(screen.getByRole('link', { name: 'queued' }).getAttribute('href')).toContain(`/send-intents/${id}`)
  })
  it('fails closed on a cross-campaign response and allows a refresh', async () => {
    const list = vi.fn<NonNullable<OutreachGateway['listCampaignRuns']>>()
      .mockResolvedValueOnce({ items: [{ ...run, campaign_id: '00000000-0000-4000-8000-000000000002' }], next_cursor: null })
      .mockResolvedValue({ items: [], next_cursor: null })
    mount({ ...port(), listCampaignRuns: list })
    await screen.findByRole('alert')
    expect(screen.queryByText('reader@example.test')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
    await waitFor(() => expect(screen.getByText('No runs on this page.')).toBeTruthy())
  })
  it('drops a superseded load error before it can refresh the shared session', async () => {
    let rejectOld: (error: unknown) => void = () => { throw new Error('Missing read') }
    const list = vi.fn<NonNullable<OutreachGateway['listCampaignRuns']>>()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
      .mockResolvedValue({ items: [], next_cursor: null })
    const refresh = mount({ ...port(), listCampaignRuns: list })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
    await screen.findByText('No runs on this page.')
    await act(async () => { rejectOld(new GatewayError('api', 'unauthenticated', 'Old session', { status: 401 })) })
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByText('No runs on this page.')).toBeTruthy()
  })
})
