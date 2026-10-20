// Regression tests for the bounded-review findings on the simulated settings adapters: capacity
// refusal instead of eviction, modal drafts reset on Cancel, per-control error association, and
// invalidation when another tab writes the same storage key.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { SessionProvider } from '@/app/session'
import { Shell } from '@/app/Shell'
import { SettingsRoutes } from './SettingsRoutes'
import { resetSimulatedCache } from './simulatedStore'
import { TAG_LIMIT } from './TagsPage'

function renderSettings(entry: string) {
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

/** The scoped storage key is only known once the session is ready; the first write reveals it. */
function storedKey(prefix: string): string {
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i)
    if (key?.startsWith(prefix)) return key
  }
  throw new Error(`no key with prefix ${prefix}`)
}

async function createTag(name: string) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Add New Tag' })[0]!)
  const dialog = await screen.findByRole('dialog', { name: 'Add New Tag' })
  fireEvent.change(within(dialog).getByLabelText('Tag Name'), { target: { value: name } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Tag' }))
  return dialog
}

beforeEach(() => {
  window.localStorage.clear()
  resetSimulatedCache()
})
afterEach(() => {
  window.localStorage.clear()
  resetSimulatedCache()
})

describe('tags adapter', () => {
  it('refuses a new tag at capacity instead of evicting the oldest one', async () => {
    renderSettings('/settings/tags')
    await screen.findByText('No tags yet')
    await createTag('Seed')
    await screen.findByRole('list', { name: 'Tags' })
    const key = storedKey('elevateo.settings.tags.')
    const full = Array.from({ length: TAG_LIMIT }, (_, i) => ({ id: `t${i}`, name: `Tag ${i}`, color: '#ef4444' }))
    window.localStorage.setItem(key, JSON.stringify(full))
    resetSimulatedCache()
    const dialog = await createTag('One more')
    expect(await within(dialog).findByText(`This workspace already has ${TAG_LIMIT} tags. Delete one before adding another.`)).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem(key) ?? '[]')).toHaveLength(TAG_LIMIT)
    expect(JSON.parse(window.localStorage.getItem(key) ?? '[]')[0].name).toBe('Tag 0')
  })

  it('clears the draft when the modal is cancelled and reopened', async () => {
    renderSettings('/settings/tags')
    await screen.findByText('No tags yet')
    fireEvent.click(screen.getAllByRole('button', { name: 'Add New Tag' })[0]!)
    let dialog = await screen.findByRole('dialog', { name: 'Add New Tag' })
    fireEvent.change(within(dialog).getByLabelText('Tag Name'), { target: { value: 'Draft' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Gold' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Add New Tag' })[0]!)
    dialog = await screen.findByRole('dialog', { name: 'Add New Tag' })
    expect((within(dialog).getByLabelText('Tag Name') as HTMLInputElement).value).toBe('')
    expect(within(dialog).getByRole('radio', { name: 'Rose' }).getAttribute('aria-checked')).toBe('true')
  })

  it('keeps the swatch grid at five columns on narrow screens and ten from sm', async () => {
    renderSettings('/settings/tags')
    await screen.findByText('No tags yet')
    fireEvent.click(screen.getAllByRole('button', { name: 'Add New Tag' })[0]!)
    const grid = within(await screen.findByRole('dialog', { name: 'Add New Tag' })).getByRole('radiogroup', { name: 'Tag colour' })
    expect(grid.className).toContain('grid-cols-5')
    expect(grid.className).toContain('sm:grid-cols-10')
    expect(within(grid).getAllByRole('radio')).toHaveLength(20)
  })
})

describe('webhook create form', () => {
  it('reports a missing event on the fieldset, not on the URL field', async () => {
    renderSettings('/settings/webhooks/create')
    const url = await screen.findByLabelText('Endpoint URL')
    fireEvent.change(url, { target: { value: 'https://example.test/hook' } })
    fireEvent.click(screen.getByLabelText('Conversation received'))
    fireEvent.click(screen.getByRole('button', { name: 'Save webhook' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Choose at least one event.')
    const fieldset = screen.getByRole('group', { name: 'Events' })
    expect(fieldset.getAttribute('aria-describedby')).toBe(alert.id)
    expect(url.getAttribute('aria-invalid')).toBeNull()
    expect(window.localStorage.length).toBe(0)
  })
})

describe('cross-tab storage', () => {
  it('re-reads a list written by another tab', async () => {
    renderSettings('/settings/workspace/invitations')
    expect(await screen.findByText('No pending invitations')).toBeTruthy()
    // Another tab writes the scoped key and the browser fires a storage event in this tab.
    const seeded = [{ id: 'x1', email: 'peer@example.test', role: 'member', created_at: '2026-10-20T10:00:00Z' }]
    const key = await invitationsKey()
    window.localStorage.setItem(key, JSON.stringify(seeded))
    fireEvent(window, new StorageEvent('storage', { key, newValue: JSON.stringify(seeded) }))
    expect(await screen.findByText('peer@example.test')).toBeTruthy()
  })
})

/** Reads the fixture session ids through the gateway so the key matches the rendered scope. */
async function invitationsKey(): Promise<string> {
  const session = await createFixtureGateway().getSession()
  return `elevateo.settings.invitations.${session.actor.id}.${session.organization.id}`
}

describe('password form', () => {
  it('attaches each problem to its own field', async () => {
    renderSettings('/settings/profile/password')
    const current = await screen.findByLabelText('Current password')
    const next = screen.getByLabelText('New Password')
    const repeat = screen.getByLabelText('Repeat new password')
    fireEvent.change(next, { target: { value: 'short' } })
    fireEvent.change(repeat, { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((a) => a.textContent)).toEqual([
      'Enter your current password.',
      'Use at least 12 characters for the new password.',
      'The new passwords do not match.',
    ])
    expect(current.getAttribute('aria-invalid')).toBe('true')
    expect(next.getAttribute('aria-invalid')).toBe('true')
    expect(repeat.getAttribute('aria-invalid')).toBe('true')
    expect(next.getAttribute('aria-describedby')).toContain('-new-error')
  })
})
