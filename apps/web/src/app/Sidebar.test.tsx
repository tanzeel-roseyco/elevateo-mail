// EmailGuard sidebar (DESIGN-SPEC §3): brand row, workspace switcher, Inbox/Dashboard, the Mail
// group, the registered Outreach and Contacts groups, Settings/Help and the account menu. The URL
// alone decides which link is current; aria-current="page" marks only the exact match.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Mailbox, Session } from '@/data/contract'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import type { FeatureNavEntry } from './featureRegistry'
import { SessionProvider } from './session'
import { Sidebar, type MailboxNavState } from './Sidebar'

const session: Session = {
  context_id: 'context_test_0123456789',
  authorization_version: 'authz_test_0123456789',
  actor: { id: '00000000-0000-4000-8000-0000000000a1', display_name: 'Test user' },
  organization: { id: '00000000-0000-4000-8000-0000000000b1', name: 'Test organization' },
  simulation_mode: true,
  csrf_token: 'csrf_test_0123456789',
}
const inbox: Mailbox = {
  id: '00000000-0000-4000-8000-000000000061',
  display_name: 'Fixture inbox',
  display_address: 'inbox@example.test',
  capabilities: { read: true, compose: true, approve_send: false, manage_members: false },
}
const outreach: FeatureNavEntry[] = [
  { path: '/outreach/campaigns', label: 'Campaigns', section: 'outreach', order: 10 },
  { path: '/outreach/leads', label: 'Leads', section: 'outreach', order: 20 },
]
const contacts: FeatureNavEntry[] = [{ path: '/people', label: 'People', section: 'contacts', order: 70 }]

type Props = Partial<Parameters<typeof Sidebar>[0]>

function renderAt(path: string, props: Props = {}) {
  const mailboxes: MailboxNavState = props.mailboxes ?? { status: 'ready', mailboxes: [inbox] }
  return render(
    <SessionProvider gateway={createFixtureGateway()}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar session={session} sections={{ outreach, contacts }} {...props} mailboxes={mailboxes} />
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('sidebar sections', () => {
  it('renders the brand, workspace switcher, primary links and every group as independent landmarks', () => {
    renderAt('/outreach/campaigns/123')
    const primary = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(primary).getByRole('link', { name: 'Inbox' }).getAttribute('href')).toBe('/inbox')
    expect(within(primary).getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/')
    const mail = screen.getByRole('navigation', { name: 'Mail' })
    expect(within(mail).getAllByRole('link').map((l) => l.textContent)).toEqual(['Fixture inbox', 'Search'])
    const groups = screen.getAllByRole('navigation').map((n) => n.getAttribute('aria-labelledby')).filter((id) => id !== null)
    expect(groups).toEqual(['sidebar-mail', 'sidebar-outreach', 'sidebar-contacts'])
    expect(within(screen.getByRole('navigation', { name: 'Outreach' })).getAllByRole('link').map((l) => l.textContent)).toEqual(['Campaigns', 'Leads'])
    expect(within(screen.getByRole('navigation', { name: 'Contacts' })).getByRole('link', { name: 'People' })).toBeTruthy()
    const admin = screen.getByRole('navigation', { name: 'Administration' })
    expect(within(admin).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
    expect(within(admin).getByRole('link', { name: 'Help' }).getAttribute('href')).toBe('/help')
    expect(screen.getByRole('button', { name: 'Workspace: Test organization' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Account and sign-out' }).textContent).toContain('Test user')
    // AIDEV-NOTE: Canonical brand asset; BrandMark tests verify provenance and reserved geometry.
    const mark = screen.getByTestId('brand-mark').querySelector('img')
    expect(mark?.getAttribute('src')).toBe('/brand/elevateo-logo.png')
    expect(mark?.getAttribute('alt')).toBe('')
    expect(screen.getByText('Elevateo Co.')).toBeTruthy()
  })

  it('marks only the exact page with aria-current while a nested path keeps its parent highlighted', () => {
    renderAt('/outreach/campaigns/123')
    const campaigns = screen.getByRole('link', { name: 'Campaigns' })
    expect(campaigns.getAttribute('aria-current')).toBeNull()
    expect(campaigns.getAttribute('data-current')).toBe('true')
    expect(screen.getByRole('link', { name: 'Leads' }).getAttribute('data-current')).toBeNull()
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('data-current')).toBeNull()
    // Mailbox folders live in the inbox layout, not the rail.
    expect(screen.queryByRole('link', { name: 'Drafts' })).toBeNull()
  })

  it('hides every empty feature section and keeps the mailbox highlighted under its sub-routes', () => {
    renderAt(`/mailboxes/${inbox.id}/drafts`, { sections: {} })
    expect(screen.queryByRole('navigation', { name: 'Outreach' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Contacts' })).toBeNull()
    const link = screen.getByRole('link', { name: 'Fixture inbox' })
    expect(link.getAttribute('aria-current')).toBeNull()
    expect(link.getAttribute('data-current')).toBe('true')
  })

  it('shows the loading, empty and retryable error states of the mailbox list', () => {
    const { unmount } = renderAt('/', { mailboxes: { status: 'loading' } })
    expect(screen.getByRole('status', { name: 'Loading mailboxes' })).toBeTruthy()
    unmount()
    const retry = vi.fn()
    const second = renderAt('/', { mailboxes: { status: 'error', message: 'Mailboxes unavailable', retry } })
    expect(screen.getByRole('alert').textContent).toContain('Mailboxes unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
    second.unmount()
    renderAt('/', { mailboxes: { status: 'ready', mailboxes: [] } })
    expect(screen.getByText('No mailboxes are visible to you.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Search' })).toBeTruthy()
  })

  it('collapses to icons with titles and an expanded toggle state', () => {
    const onToggle = vi.fn()
    renderAt('/', { collapsed: true, onToggle })
    const toggle = screen.getByRole('button', { name: 'Toggle sidebar' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('link', { name: 'Inbox' }).getAttribute('title')).toBe('Inbox')
    expect(screen.queryByRole('button', { name: /Workspace:/ })).toBeNull()
    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
