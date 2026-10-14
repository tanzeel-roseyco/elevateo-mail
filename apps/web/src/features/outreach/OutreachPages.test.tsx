import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { GatewayError } from '@/data/errors'
import {
  OutreachCampaignCreatePage, OutreachCampaignDetailPage, OutreachCampaignLeadsPage,
  OutreachCampaignsPage,
} from './OutreachPages'
import type { OutreachGateway } from './contract'

const campaignId = '1a40d184-987d-4b50-98d2-f674e41842f9'
const leadId = '7206b079-7c79-4d06-a025-d80649b39573'
const context = { contextId: 'ctx', authorizationVersion: '1' }
const proof = { csrfToken: 'test-proof' }
const campaign = { id: campaignId, name: 'Pilot', status: 'draft' }
const lead = { id: leadId, email: 'test@example.invalid', consent_status: 'unknown', suppressed: false }
function gateway(overrides: Partial<OutreachGateway> = {}): OutreachGateway {
  return {
    listCampaigns: vi.fn(async () => ({ items: [campaign] })),
    getCampaign: vi.fn(async () => campaign),
    createCampaign: vi.fn(async () => campaign),
    updateCampaign: vi.fn(async () => ({ ...campaign, status: 'paused' })),
    listLeads: vi.fn(async () => ({ items: [lead] })),
    addLead: vi.fn(async () => lead),
    updateLead: vi.fn(async () => lead),
    listAccounts: vi.fn(async () => ({ items: [] })),
    getAccount: vi.fn(async () => ({ id: leadId, mailbox_id: campaignId, label: 'Account', status: 'disabled' })),
    listAnalytics: vi.fn(async () => ({ items: [] })),
    ...overrides,
  }
}
function view(path: string, g?: OutreachGateway) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/outreach/campaigns" element={<OutreachCampaignsPage gateway={g} context={context} proof={proof} />} />
    <Route path="/outreach/campaigns/new" element={<OutreachCampaignCreatePage gateway={g} context={context} proof={proof} />} />
    <Route path="/outreach/campaigns/:campaignId" element={<OutreachCampaignDetailPage gateway={g} context={context} proof={proof} />} />
    <Route path="/outreach/campaigns/:campaignId/leads" element={<OutreachCampaignLeadsPage gateway={g} context={context} proof={proof} />} />
  </Routes></MemoryRouter>)
}

describe('Outreach routed pages', () => {
  it('creates a draft and navigates to its detail without any send control', async () => {
    const g = gateway(); view('/outreach/campaigns/new', g)
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'Pilot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByRole('heading', { name: 'Campaign detail' })).toBeTruthy()
    expect(g.createCampaign).toHaveBeenCalledWith(context, proof, { name: 'Pilot', status: 'draft' }, expect.any(AbortSignal))
    expect(screen.queryByRole('button', { name: /send|enroll/i })).toBeNull()
  })
  it('reports an uncertain create failure without automatic duplicate submission', async () => {
    const g = gateway({ createCampaign: vi.fn(async () => { throw new Error('timeout') }) })
    view('/outreach/campaigns/new', g)
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'Pilot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/not confirmed/))
    expect(g.createCampaign).toHaveBeenCalledTimes(1)
  })
  it('adds an unknown-consent lead and never submits a consent assertion', async () => {
    const g = gateway(); view(`/outreach/campaigns/${campaignId}/leads`, g)
    await screen.findByText(/test@example.invalid/)
    fireEvent.change(screen.getByLabelText('Add lead email'), { target: { value: 'new@example.invalid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add lead' }))
    expect(g.addLead).toHaveBeenCalledWith(context, proof, { campaign_id: campaignId, email: 'new@example.invalid' }, expect.any(AbortSignal))
  })
  it('shows a read failure and rejects incompatible active campaign data', async () => {
    const g = gateway({ listCampaigns: vi.fn(async () => ({ items: [{ ...campaign, status: 'active' }] })) })
    view('/outreach/campaigns', g)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(g.createCampaign).not.toHaveBeenCalled()
  })
  it('keeps pause failure visible without claiming a state transition', async () => {
    const g = gateway({ updateCampaign: vi.fn(async () => { throw new Error('409') }) })
    view(`/outreach/campaigns/${campaignId}`, g)
    await screen.findByText(/Pilot/)
    fireEvent.click(screen.getByRole('button', { name: 'Pause campaign' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/not confirmed/))
    expect(screen.getByText(/Pilot · draft/)).toBeTruthy()
  })
  it('keeps a failed lead mutation uncertain and blocks a second submission', async () => {
    const g = gateway({ addLead: vi.fn(async () => { throw new Error('503 from backend') }) })
    view(`/outreach/campaigns/${campaignId}/leads`, g)
    await screen.findByText(/test@example.invalid/)
    fireEvent.change(screen.getByLabelText('Add lead email'), { target: { value: 'new@example.invalid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add lead' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/not confirmed/))
    expect((screen.getByRole('button', { name: 'Add lead' }) as HTMLButtonElement).disabled).toBe(true)
    expect(g.addLead).toHaveBeenCalledTimes(1)
  })
  it('shows unavailable without an adapter and disables draft creation', () => {
    view('/outreach/campaigns/new')
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('keeps a definitive validation rejection editable', async () => {
    const g = gateway({ createCampaign: vi.fn(async () => { throw new GatewayError('api', 'request_invalid', 'name rejected', { status: 400 }) }) })
    view('/outreach/campaigns/new', g)
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'Pilot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/rejected/))
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
