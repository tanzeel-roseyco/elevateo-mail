import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OutreachCampaignsPage } from './OutreachPages'
import type { OutreachReads } from './contract'

const context = { contextId: 'ctx', authorizationVersion: '1' }
const campaign = { items: [{ id: '1a40d184-987d-4b50-98d2-f674e41842f9', name: 'Pilot', status: 'paused' }] }

function reads(result: unknown): OutreachReads {
  return {
    listCampaigns: async () => result,
    listLeads: async () => ({ items: [] }),
    listAccounts: async () => ({ items: [] }),
    listAnalytics: async () => ({ items: [] }),
  }
}

describe('Outreach campaigns page', () => {
  it('renders a validated paused campaign without an action', async () => {
    render(<OutreachCampaignsPage reads={reads(campaign)} context={context} />)
    expect(await screen.findByText(/Pilot/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('shows unavailable when the gateway capability is absent', () => {
    render(<OutreachCampaignsPage context={context} />)
    expect(screen.getByRole('status').textContent).toMatch(/unavailable/)
  })
  it('shows an error on an incompatible response', async () => {
    render(<OutreachCampaignsPage reads={reads({ items: [{ ...campaign.items[0], status: 'active' }] })} context={context} />)
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})
