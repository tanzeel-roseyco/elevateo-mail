// Production entry (no `simulatedSettings` flag): every setting without a server endpoint renders
// the explicit unavailable state, never a form whose save stays in the browser; nothing is written
// to localStorage; the server-backed pages and the real reference/Postman cards stay reachable.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { SessionProvider } from '@/app/session'
import { Shell } from '@/app/Shell'
import { SettingsRoutes } from './SettingsRoutes'
import { resetSimulatedCache } from './simulatedStore'

function renderProduction(entry: string) {
  return render(
    <SessionProvider gateway={createFixtureGateway()}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<p>dashboard-outlet</p>} />
            <Route path="/settings/*" element={<SettingsRoutes />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  resetSimulatedCache()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  resetSimulatedCache()
})

const CASES: ReadonlyArray<{ path: string; title: string; action: string; href: string }> = [
  { path: '/settings/tags', title: 'Tags are not available yet', action: 'Open inbox', href: '/inbox' },
  { path: '/settings/webhooks', title: 'Webhooks are not available yet', action: 'Developer API', href: '/settings/developer-api' },
  { path: '/settings/webhooks/create', title: 'Webhooks are not available yet', action: 'Developer API', href: '/settings/developer-api' },
  { path: '/settings/developer-api', title: 'API tokens are not available yet', action: 'Full API Reference', href: '/help/articles/developer-api-overview' },
  { path: '/settings/workspace/name', title: 'Renaming is not available yet', action: 'Manage Members', href: '/settings/workspace/members' },
  { path: '/settings/workspace/invite', title: 'Invitations are not available yet', action: 'Manage Members', href: '/settings/workspace/members' },
  { path: '/settings/workspace/invitations', title: 'No pending invitations to show', action: 'Manage Members', href: '/settings/workspace/members' },
  { path: '/settings/workspace/create', title: 'Creating a workspace is not available yet', action: 'Current Workspace', href: '/settings/workspace' },
  { path: '/settings/profile/password', title: 'Password changes are not available here', action: 'Personal Details', href: '/settings/profile/personal-details' },
]

describe('settings without a server endpoint in the production entry', () => {
  for (const { path, title, action, href } of CASES) {
    it(`${path} shows the unavailable state with a real destination and no simulated form`, async () => {
      // A write-then-remove would leave storage empty, so the write itself is what must not happen.
      const setItem = vi.spyOn(Storage.prototype, 'setItem')
      renderProduction(path)
      await screen.findByRole('heading', { name: title })
      // The destination may also be a settings tab or hub card; at least one link must carry it to the real route.
      expect(screen.getAllByRole('link', { name: action }).map((link) => link.getAttribute('href'))).toContain(href)
      expect(screen.queryByText('Simulated UI adapter: not saved on the server')).toBeNull()
      // No form or editable control may exist: there is nothing it could truthfully do.
      expect(document.querySelector('form')).toBeNull()
      expect(screen.queryAllByRole('textbox')).toEqual([])
      expect(screen.queryAllByRole('combobox')).toEqual([])
      expect(screen.queryAllByRole('checkbox')).toEqual([])
      expect(screen.queryAllByRole('button', { name: /add|save|create|send|generate|change|update/i })).toEqual([])
      expect(setItem).not.toHaveBeenCalled()
      expect(window.localStorage.length).toBe(0)
    })
  }

  it('keeps the real API reference, Postman download and white-label card on the Developer API page', async () => {
    renderProduction('/settings/developer-api')
    await screen.findByRole('heading', { name: 'API tokens are not available yet' })
    expect(screen.getByRole('link', { name: /Postman Collection/ }).getAttribute('href')).toBe('/developer/elevateo-mail.postman_collection.json')
    expect(screen.getAllByRole('link', { name: /Full API Reference/ }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('White-label Elevateo Mail')).toBeTruthy()
  })

  it('shows the server workspace name read-only on the rename page', async () => {
    renderProduction('/settings/workspace/name')
    await screen.findByRole('heading', { name: 'Renaming is not available yet' })
    expect(screen.getByText('Workspace name')).toBeTruthy()
    // The fixture session (contracts/v1 session_a) names the organization; the page must show that value.
    // The shell also names the current workspace, so more than one match is expected.
    expect((await screen.findAllByText('Synthetic organization A')).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
