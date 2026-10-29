// FE-805 wiring: registered routes render the owners' real pages with session context, CSRF proof
// and the optional Outreach gateway; an absent gateway yields each owner's own honest state.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { createV2OutreachGateway } from '@/data/v2OutreachGateway'
import type { OutreachGateway } from '@/features/outreach/contract'
import { FeatureGatewaysProvider, type FeatureGateways } from '../featureGateways'
import { SessionProvider } from '../session'
import { PageBoundary } from '../PageBoundary'
import { featureRegistry, featureRoutes } from './index'

function renderRoute(path: string, gateways: FeatureGateways) {
  return render(
    <SessionProvider gateway={createFixtureGateway()}>
      <FeatureGatewaysProvider value={gateways}>
        <MemoryRouter initialEntries={[path]}>
          <PageBoundary><Routes>
            {featureRoutes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
          </Routes></PageBoundary>
        </MemoryRouter>
      </FeatureGatewaysProvider>
    </SessionProvider>,
  )
}

const unused = vi.fn(async () => { throw new Error('not expected in this test') })
const outreach: OutreachGateway = {
  listCampaigns: async () => ({ items: [{ id: '1a40d184-987d-4b50-98d2-f674e41842f9', name: 'Pilot', status: 'paused', version: 1 }], next_cursor: null }),
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
  it('registers Celeste\'s twelve Outreach routes and Lyra\'s three personal routes with top-level nav only', () => {
    const outreachPaths = featureRoutes.map((r) => r.path).filter((p) => p.startsWith('/outreach/'))
    expect(outreachPaths).toHaveLength(12)
    expect(outreachPaths).toContain('/outreach/campaigns/:campaignId/sequence')
    expect(featureRegistry.navBySection.outreach.map((e) => e.label)).toEqual(['Campaigns', 'Leads', 'Accounts', 'Analytics'])
    expect(featureRegistry.navBySection.contacts.map((e) => e.path)).toEqual(['/people', '/email-finder'])
    expect(featureRoutes.filter((route) => route.path === '/email-finder')).toHaveLength(1)
    expect(featureRegistry.navBySection.settings).toEqual([])
  })

  it('passes the session context and Outreach gateway to Celeste\'s campaigns page (happy path)', async () => {
    renderRoute('/outreach/campaigns', { outreach })
    // Lazy Outreach chunk: a longer wait keeps this deterministic under a loaded parallel run.
    expect(await screen.findByRole('link', { name: 'Pilot' }, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Create draft campaign' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /save|pause|add|create/i })).toBeNull()
  })

  it('shows Celeste\'s own unavailable state when no Outreach gateway is connected', async () => {
    renderRoute('/outreach/campaigns', {})
    expect(await screen.findByRole('heading', { name: 'Campaigns' }, { timeout: 10_000 })).toBeTruthy()
    expect((await screen.findByText('Outreach API unavailable for this account.')).getAttribute('role')).toBe('status')
  })

  it("routes a campaign-scoped account read through the real V2 adapter, which fails explicitly without any dispatch", async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    renderRoute('/outreach/campaigns/1a40d184-987d-4b50-98d2-f674e41842f9/accounts', { outreach: createV2OutreachGateway(fetchImpl) })
    // The adapter rejects with temporarily_unavailable before any dispatch; Celeste's page renders
    // that as her own unavailable status rather than an error alert.
    expect((await screen.findByText('Outreach API unavailable for this account.')).getAttribute('role')).toBe('status')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /save|pause|add|create/i })).toBeNull()
  })
})
