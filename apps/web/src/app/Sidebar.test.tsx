// FE-805: the rail shows Personal and Outreach as independent landmarks with no state switcher;
// the URL alone decides which link is current, and an empty Outreach registry hides that section.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Mailbox } from '@/data/contract'
import type { FeatureNavEntry } from './featureRegistry'
import { Sidebar } from './Sidebar'

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

function renderAt(path: string, entries: FeatureNavEntry[] = outreach) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar mailboxes={[inbox]} outreach={entries} footnote="footnote" />
    </MemoryRouter>,
  )
}

describe('sidebar sections', () => {
  it('renders Personal and Outreach as independent navigation landmarks with the authentic mark', () => {
    renderAt('/outreach/campaigns/123')
    const personal = screen.getByRole('navigation', { name: 'Personal' })
    const outreachNav = screen.getByRole('navigation', { name: 'Outreach' })
    expect(within(personal).getByRole('link', { name: 'Fixture inbox' })).toBeTruthy()
    expect(within(personal).getByRole('link', { name: 'Search' })).toBeTruthy()
    expect(within(outreachNav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Campaigns', 'Leads'])
    // No switcher: there is no button or tab control anywhere in the rail.
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    // The authentic PNG, not a redrawn or text substitute; decorative beside the product name.
    const mark = screen.getByTestId('brand-mark').querySelector('img')
    expect(mark?.getAttribute('src')).toBe('/brand/logo-icon.png')
    expect(mark?.getAttribute('alt')).toBe('')
    expect(screen.getByText('Elevateo Mail')).toBeTruthy()
  })

  it('marks only the exact Outreach page current while a nested path keeps its parent highlighted', () => {
    renderAt('/outreach/campaigns/123')
    const campaigns = screen.getByRole('link', { name: 'Campaigns' })
    expect(campaigns.getAttribute('aria-current')).toBeNull()
    expect(campaigns.className).toContain('bg-accent-soft')
    expect(screen.getByRole('link', { name: 'Leads' }).className).not.toContain('bg-accent-soft')
    // The mailbox entry is untouched by Outreach activity: Drafts sub-links only expand under its own route.
    expect(screen.queryByRole('link', { name: 'Drafts' })).toBeNull()
  })

  it('hides the Outreach section when no feature registered links, and keeps Personal intact', () => {
    renderAt('/mailboxes/00000000-0000-4000-8000-000000000061/drafts', [])
    expect(screen.queryByRole('navigation', { name: 'Outreach' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Drafts' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Fixture inbox' }).getAttribute('aria-current')).toBeNull()
  })
})
