// Settings area: the six tabs, legacy redirects, the real members hub and the simulated adapters
// (tags, tokens, webhooks) that must be labelled and must stay in the browser.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CD_FIXTURE } from '@/data/fixtures/collaborationState'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { SessionProvider } from '@/app/session'
import { Shell } from '@/app/Shell'
import { FeatureGatewaysProvider } from '@/app/featureGateways'
import { SettingsRoutes } from './SettingsRoutes'
import { resetSimulatedCache } from './simulatedStore'
import { settingsPageMeta } from './SettingsLayout'

function renderSettings(entry: string) {
  return render(
    <SessionProvider gateway={createFixtureGateway()}>
      {/* The demo/dev-fixture flag: these tests cover the labelled browser-local adapter path. */}
      <FeatureGatewaysProvider value={{ simulatedSettings: true }}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<p>dashboard-outlet</p>} />
            <Route path="/settings/*" element={<SettingsRoutes />} />
          </Route>
        </Routes>
      </MemoryRouter>
      </FeatureGatewaysProvider>
    </SessionProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  resetSimulatedCache()
})
afterEach(() => {
  window.localStorage.clear()
  resetSimulatedCache()
})

describe('settings area', () => {
  it('opens on the Workspace hub with the six section tabs and no billing tab', async () => {
    renderSettings('/settings')
    expect(await screen.findByRole('heading', { name: 'Current Workspace', level: 1 })).toBeTruthy()
    const tabs = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(tabs).getAllByRole('link').map((l) => l.textContent)).toEqual(['Workspace', 'Profile', 'Tags', 'Developer API', 'Webhooks', 'Integrations'])
    expect(within(tabs).queryByRole('link', { name: 'Billing' })).toBeNull()
    expect(within(tabs).getByRole('link', { name: 'Workspace' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: /Manage Members/ }).getAttribute('href')).toBe('/settings/workspace/members')
  })

  it('redirects the legacy personal and organization routes into the new sections', async () => {
    // Personal Details is Lyra's real page: it reads /v2/me/preferences with the session headers.
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
      const first = renderSettings('/settings/personal')
      expect(await screen.findByRole('heading', { name: 'Personal Details', level: 1 })).toBeTruthy()
      expect(await screen.findByText(/Signed in as Fixture user A/)).toBeTruthy()
      expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveProperty('value', 'Fixture user A')
      expect(screen.getByRole('button', { name: 'Save display name' })).toBeTruthy()
      expect(preferenceFetch).toHaveBeenCalledWith('/v2/me/preferences', expect.objectContaining({ method: 'GET' }))
      first.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
    renderSettings('/settings/organization')
    expect(await screen.findByRole('heading', { name: 'Manage Members', level: 1 })).toBeTruthy()
    expect(await within(screen.getByRole('main')).findByRole('link', { name: /Fixture inbox/ })).toBeTruthy()
  })

  it('creates a tag through the modal and labels the page as a simulated adapter', async () => {
    renderSettings('/settings/tags')
    expect(await screen.findByText('No tags yet')).toBeTruthy()
    expect(screen.getByText('Simulated UI adapter: not saved on the server')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Add New Tag' })[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Add New Tag' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Tag' }))
    expect(await within(dialog).findByText('Enter a tag name of 1 to 40 characters.')).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('Tag Name'), { target: { value: 'Priority' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Gold' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Tag' }))
    const list = await screen.findByRole('list', { name: 'Tags' })
    expect(within(list).getByText('Priority')).toBeTruthy()
    expect(window.localStorage.length).toBe(1)
    expect(window.localStorage.key(0)).toMatch(/^elevateo\.settings\.tags\./)
  })

  it('rejects a non-HTTPS webhook URL and keeps the empty state', async () => {
    renderSettings('/settings/webhooks/create')
    const url = await screen.findByLabelText('Endpoint URL')
    fireEvent.change(url, { target: { value: 'http://example.test/hook' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save webhook' }))
    expect(await screen.findByText('Enter a valid https:// URL.')).toBeTruthy()
    expect(window.localStorage.length).toBe(0)
  })

  it('offers the Postman collection as a same-tab download next to the API reference', async () => {
    renderSettings('/settings/developer-api')
    const card = await screen.findByRole('link', { name: /Postman Collection/ })
    expect(card.getAttribute('href')).toBe('/developer/elevateo-mail.postman_collection.json')
    expect(card.hasAttribute('download')).toBe(true)
    expect(screen.getByRole('link', { name: 'Contact us about white-label' }).getAttribute('href')).toBe('/help/community')
  })

  it('resolves page titles by the longest matching route prefix', () => {
    expect(settingsPageMeta('/settings/profile/password').title).toBe('Password')
    expect(settingsPageMeta('/settings/integrations/mcp').parents?.[0]?.to).toBe('/settings/integrations')
    expect(settingsPageMeta('/settings/unknown').title).toBe('Current Workspace')
  })
})
