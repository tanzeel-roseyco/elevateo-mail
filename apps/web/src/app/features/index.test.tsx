// FE-805 wiring: registered routes render the owners' real pages with session context and the
// optional feature gateways; an absent capability yields an explicit not-connected state.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import type { AdminGateway } from '@/features/members/adminModel'
import { CONFIG_PEOPLE } from '@/features/members/adminModel'
import type { OutreachReads } from '@/features/outreach/contract'
import { FeatureGatewaysProvider, type FeatureGateways } from '../featureGateways'
import { SessionProvider } from '../session'
import { featureRoutes } from './index'

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

const empty = async () => ({ items: [] })
const outreach: OutreachReads = {
  listCampaigns: async () => ({ items: [{ id: '1a40d184-987d-4b50-98d2-f674e41842f9', name: 'Pilot', status: 'paused' }] }),
  listLeads: empty,
  listAccounts: empty,
  listAnalytics: empty,
}

describe('feature route wiring', () => {
  it('passes the session context and Outreach reads to Celeste\'s campaigns page (happy path)', async () => {
    renderRoute('/outreach/campaigns', { outreach })
    expect(await screen.findByText(/Pilot/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders an explicit not-connected page for administration when the V2 admin gateway is absent', async () => {
    renderRoute('/people', {})
    expect(await screen.findByText('People is not connected in this build')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to mail' })).toBeTruthy()
    expect(screen.queryByText('Allan Chan')).toBeNull()
  })

  it('renders Lyra\'s administration page through the protected session when an admin gateway exists', async () => {
    const admin: AdminGateway = {
      listOrganizationGrants: async () => ({ revision: 1, can_manage_grants: false, people: CONFIG_PEOPLE, grants: [] }),
      replaceOrganizationGrant: async () => { throw new Error('never called') },
    }
    renderRoute('/settings', { admin })
    expect(await screen.findByText('Allan Chan')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.queryByText('Review grant')).toBeNull()
  })
})
