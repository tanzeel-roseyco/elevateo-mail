// AIDEV-NOTE: A dashboard read must never refresh a session after its owner has left the route.
import { useLayoutEffect, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { FeatureGatewaysProvider } from '@/app/featureGateways'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { OutreachGateway } from './contract'
import { CampaignOverview } from './CampaignOverview'

// Only the list capability is exercised; all other port members fail loudly if called.
function outreach(listCampaigns: OutreachGateway['listCampaigns']): OutreachGateway {
  const unavailable = async (): Promise<never> => { throw new Error('Unexpected operation') }
  return { listCampaigns, getCampaign: unavailable, createCampaign: unavailable, updateCampaign: unavailable, listLeads: unavailable, addLead: unavailable, updateLead: unavailable, listAccounts: unavailable, getAccount: unavailable, listAnalytics: unavailable }
}
function harness(port: OutreachGateway) {
  const gateway = createFixtureGateway()
  const refresh = vi.spyOn(gateway, 'refreshSession')
  const tree = (children: ReactNode) => <SessionProvider gateway={gateway}><FeatureGatewaysProvider value={{ outreach: port }}><MemoryRouter>{children}</MemoryRouter></FeatureGatewaysProvider></SessionProvider>
  return { gateway, refresh, tree }
}
describe('marketing overview', () => {
  it('validates a bounded campaign page and labels non-live campaigns honestly', async () => {
    const { tree } = harness(outreach(async () => ({ items: [{ id: '00000000-0000-4000-8000-000000000091', name: 'October launch', status: 'draft', version: 1 }], next_cursor: null })))
    render(tree(<CampaignOverview />))
    expect((await screen.findByRole('link', { name: 'October launch draft' })).getAttribute('href')).toContain('/outreach/campaigns/')
    expect(screen.getByText('Campaign sending is unavailable in this connection. Drafts and consent records require the Outreach API.')).toBeTruthy()
  })
  it('offers retry after an invalid response instead of rendering unvalidated campaign data', async () => {
    const list = vi.fn<OutreachGateway['listCampaigns']>().mockResolvedValueOnce({ items: [{ name: 'Invalid campaign' }], next_cursor: null }).mockResolvedValueOnce({ items: [], next_cursor: null })
    const { tree } = harness(outreach(list))
    render(tree(<CampaignOverview />))
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await screen.findByText('Your first campaign starts here.')
    expect(list).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Invalid campaign')).toBeNull()
  })
  it('ignores a revoked-session failure delivered during replacement layout effects', async () => {
    let rejectRead: (error: unknown) => void = () => { throw new Error('Read not started') }
    const list = vi.fn<OutreachGateway['listCampaigns']>(() => new Promise((_resolve, reject) => { rejectRead = reject }))
    const { tree, refresh } = harness(outreach(list))
    const view = render(tree(<CampaignOverview />))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    function Replacement() {
      useLayoutEffect(() => { rejectRead(new GatewayError('api', 'unauthenticated', 'Ended', { status: 401, requestId: 'r1' })) }, [])
      return <p>Another workspace</p>
    }
    await act(async () => { view.rerender(tree(<Replacement />)) })
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByText('Another workspace')).toBeTruthy()
  })
})
