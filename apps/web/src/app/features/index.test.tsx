// FE-805 wiring: registered routes render the owners' real pages with session context, CSRF proof
// and the optional Outreach gateway; an absent gateway yields each owner's own honest state.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import type { OutreachGateway } from '@/features/outreach/contract'
import { FeatureGatewaysProvider, type FeatureGateways } from '../featureGateways'
import { SessionProvider } from '../session'
import { featureRegistry, featureRoutes } from './index'

function renderRoute(path: string, gateways: FeatureGateways) {
  return render(
    <SessionProvider gateway={createFixtureGateway()}>
      <FeatureGatewaysProvider value={gateways}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            {featureRoutes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
          </Routes>
        </MemoryRouter>
      </FeatureGatewaysProvider>
    </SessionProvider>,
  )
}

const unused = vi.fn(async () => { throw new Error('not expected in this test') })
const outreach: OutreachGateway = {
  listCampaigns: async () => ({ items: [{ id: '1a40d184-987d-4b50-98d2-f674e41842f9', name: 'Pilot', status: 'paused' }] }),
  getCampaign: unused,
  createCampaign: unused,
  updateCampaign: unused,
  listLeads: unused,
  addLead: unused,
  updateLead: unused,
  listAccounts: unused,
  getAccount: unused,
  listAnalytics: unused,
}

describe('feature route wiring', () => {
  it('registers Celeste\'s ten Outreach routes and Lyra\'s three personal routes with top-level nav only', () => {
    expect(featureRoutes.map((r) => r.path).filter((p) => p.startsWith('/outreach/'))).toHaveLength(10)
    expect(featureRegistry.navBySection.outreach.map((e) => e.label)).toEqual(['Campaigns', 'Leads', 'Accounts', 'Analytics'])
    expect(featureRegistry.navBySection.personal.map((e) => e.path)).toEqual(['/people', '/settings/personal', '/settings/organization'])
  })

  it('passes the session context and Outreach gateway to Celeste\'s campaigns page (happy path)', async () => {
    renderRoute('/outreach/campaigns', { outreach })
    expect(await screen.findByRole('link', { name: 'Pilot' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Create draft campaign' })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows Celeste\'s own unavailable state when no Outreach gateway is connected', async () => {
    renderRoute('/outreach/campaigns', {})
    expect(await screen.findByRole('heading', { name: 'Campaigns' })).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toBe('Outreach API unavailable for this account.')
  })

  it('renders Lyra\'s personal settings from the live session without any gateway', async () => {
    renderRoute('/settings/personal', {})
    expect(await screen.findByText(/Signed in as Fixture user A/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
