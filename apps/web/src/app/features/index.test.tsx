// FE-805 wiring: registered routes render the owners' real pages with session context, CSRF proof
// and the optional Outreach gateway; an absent gateway yields each owner's own honest state.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { CD_FIXTURE } from '@/data/fixtures/collaborationState'
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
    expect((await screen.findByText('Outreach API unavailable for this account.')).getAttribute('role')).toBe('status')
  })

  it('renders Lyra\'s personal settings with the current actor preference', async () => {
    const preferenceFetch = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(path).toBe('/v2/me/preferences')
      const headers = new Headers(init?.headers)
      expect(headers.get('X-Session-Context')).toBe(CD_FIXTURE.contextId)
      expect(headers.get('X-Authorization-Version')).toBe(CD_FIXTURE.authorizationVersion)
      return new Response(JSON.stringify({
        context_id: CD_FIXTURE.contextId,
        authorization_version: CD_FIXTURE.authorizationVersion,
        display_name: 'Fixture user A', revision: 1,
      }), { headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', preferenceFetch)
    try {
      renderRoute('/settings/personal', {})
      expect(await screen.findByText(/Signed in as Fixture user A/)).toBeTruthy()
      expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveProperty('value', 'Fixture user A')
      expect(screen.getByRole('button', { name: 'Save display name' })).toBeTruthy()
      expect(preferenceFetch).toHaveBeenCalledWith('/v2/me/preferences', expect.objectContaining({ method: 'GET' }))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("routes a campaign-scoped account read through the real V2 adapter, which fails explicitly without any dispatch", async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    renderRoute('/outreach/campaigns/1a40d184-987d-4b50-98d2-f674e41842f9/accounts', { outreach: createV2OutreachGateway(fetchImpl) })
    // The adapter rejects with temporarily_unavailable before any dispatch; Celeste's page renders
    // that as her own unavailable status rather than an error alert.
    expect((await screen.findByText('Outreach API unavailable for this account.')).getAttribute('role')).toBe('status')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
