import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { GatewayError } from '@/data/errors'
import {
  OutreachCampaignCreatePage, OutreachCampaignDetailPage, OutreachCampaignLeadsPage,
  OutreachCampaignsPage, OutreachLeadDetailPage, OutreachAccountDetailPage, OutreachCampaignAccountsPage,
  OutreachCampaignAnalyticsPage, type OutreachPageProps,
} from './OutreachPages'
import type { OutreachGateway } from './contract'

const campaignId = '1a40d184-987d-4b50-98d2-f674e41842f9'
const leadId = '7206b079-7c79-4d06-a025-d80649b39573'
const context = { contextId: 'ctx', authorizationVersion: '1' }
const proof = { csrfToken: 'test-proof' }
const campaign = { id: campaignId, name: 'Pilot', status: 'draft', version: 1 }
const lead = { id: leadId, campaign_id: campaignId, email: 'test@example.invalid', consent_status: 'unknown', suppressed: false, version: 1 }
function gateway(overrides: Partial<OutreachGateway> = {}): OutreachGateway {
  return {
    listCampaigns: vi.fn(async () => ({ items: [campaign], next_cursor: null })),
    getCampaign: vi.fn(async (_ctx, id) => ({ ...campaign, id })),
    createCampaign: vi.fn(async (_ctx, _proof, input) => ({ ...campaign, id: input.id, name: input.name })),
    updateCampaign: vi.fn(async () => ({ ...campaign, status: 'paused' })),
    listLeads: vi.fn(async () => ({ items: [lead], next_cursor: null })),
    getLead: vi.fn(async () => lead),
    addLead: vi.fn(async (_ctx, _proof, _campaignId, input) => ({ ...lead, id: input.id, email: input.email })),
    updateLead: vi.fn(async (_ctx, _proof, _campaignId, _leadId, input) => ({ ...lead, email: input.email })),
    listAccounts: vi.fn(async () => ({ items: [], next_cursor: null })),
    getAccount: vi.fn(async () => ({ id: leadId, campaign_id: campaignId, mailbox_id: campaignId, label: 'Account', status: 'disabled', version: 1 })),
    listAnalytics: vi.fn(async () => ({ campaign_id: campaignId, lead_count: 0, consented_count: 0 })),
    ...overrides,
  }
}
function view(path: string, g?: OutreachGateway) {
  const props: OutreachPageProps = g === undefined ? { context, proof } : { gateway: g, context, proof }
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/outreach/campaigns" element={<OutreachCampaignsPage {...props} />} />
    <Route path="/outreach/campaigns/new" element={<OutreachCampaignCreatePage {...props} />} />
    <Route path="/outreach/campaigns/:campaignId" element={<OutreachCampaignDetailPage {...props} />} />
    <Route path="/outreach/campaigns/:campaignId/leads" element={<OutreachCampaignLeadsPage {...props} />} />
    <Route path="/outreach/campaigns/:campaignId/leads/:leadId" element={<OutreachLeadDetailPage {...props} />} />
    <Route path="/outreach/campaigns/:campaignId/accounts/:accountId" element={<OutreachAccountDetailPage {...props} />} />
    <Route path="/outreach/campaigns/:campaignId/accounts" element={<OutreachCampaignAccountsPage {...props} />} />
    <Route path="/outreach/campaigns/:campaignId/analytics" element={<OutreachCampaignAnalyticsPage {...props} />} />
  </Routes></MemoryRouter>)
}

describe('Outreach routed pages', () => {
  it('creates a draft and navigates to its detail without any send control', async () => {
    const g = gateway(); view('/outreach/campaigns/new', g)
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'Pilot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByRole('heading', { name: 'Campaign detail' })).toBeTruthy()
    expect(g.createCampaign).toHaveBeenCalledWith(context, proof, expect.objectContaining({ id: expect.any(String), operation_id: expect.any(String), name: 'Pilot', status: 'draft' }), expect.any(AbortSignal))
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
    expect(g.addLead).toHaveBeenCalledWith(context, proof, campaignId, expect.objectContaining({ id: expect.any(String), operation_id: expect.any(String), email: 'new@example.invalid' }), expect.any(AbortSignal))
  })
  it('shows a read failure and rejects incompatible active campaign data', async () => {
    const g = gateway({ listCampaigns: vi.fn(async () => ({ items: [{ ...campaign, status: 'active' }], next_cursor: null })) })
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
  it('sends a versioned pause intent and reloads server-owned status', async () => {
    const g = gateway({ updateCampaign: vi.fn(async (_ctx, _proof, _id, input) => ({ ...campaign, name: input.name, status: input.status, version: 2 })) })
    view(`/outreach/campaigns/${campaignId}`, g)
    await screen.findByText(/Pilot/)
    fireEvent.click(screen.getByRole('button', { name: 'Pause campaign' }))
    expect(g.updateCampaign).toHaveBeenCalledWith(context, proof, campaignId, expect.objectContaining({
      operation_id: expect.any(String), expected_version: 1, name: 'Pilot', status: 'paused',
    }), expect.any(AbortSignal))
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
  it('records separate attested consent evidence without a send action', async () => {
    const g = gateway({ recordConsent: vi.fn(async () => ({ ...lead, consent_status: 'granted', version: 2 })) })
    view(`/outreach/campaigns/${campaignId}/leads`, g)
    await screen.findByText(/test@example.invalid/)
    fireEvent.click(screen.getByRole('button', { name: 'Record consent evidence' }))
    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Signed intake form' } })
    fireEvent.change(screen.getByLabelText('Observed date and time (local)'), { target: { value: '2026-10-14T12:00' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /I attest/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record evidence' }))
    expect(g.recordConsent).toHaveBeenCalledWith(context, proof, campaignId, leadId, expect.objectContaining({
      operation_id: expect.any(String), expected_version: 1, source: 'Signed intake form', observed_at: expect.stringMatching(/Z$/), attested: true,
    }), expect.any(AbortSignal))
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull()
  })
  it('rejects a malformed campaign route before any gateway request', async () => {
    const g = gateway(); view('/outreach/campaigns/not-a-uuid/leads', g)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(g.listLeads).not.toHaveBeenCalled()
  })
  it('navigates a bounded cursor page without silently hiding more campaigns', async () => {
    const g = gateway({ listCampaigns: vi.fn(async (_ctx, query) => query.cursor
      ? { items: [{ ...campaign, id: leadId, name: 'Second' }], next_cursor: null }
      : { items: [campaign], next_cursor: campaignId }) })
    view('/outreach/campaigns', g)
    fireEvent.click(await screen.findByRole('link', { name: 'Next campaign page' }))
    expect(await screen.findByRole('link', { name: 'Second' })).toBeTruthy()
    expect(g.listCampaigns).toHaveBeenCalledWith(context, { cursor: campaignId }, expect.any(AbortSignal))
  })
  it('shows server evidence on a distinct lead detail route without claiming send authority', async () => {
    const g = gateway({ getLead: vi.fn(async () => ({ ...lead, consent_status: 'granted', consent_source: 'Signed intake form', consent_recorded_at: '2026-10-14T12:00:00Z', consent_recorded_by: campaignId, consent_evidence_kind: 'manual_attestation' })) })
    view(`/outreach/campaigns/${campaignId}/leads/${leadId}`, g)
    expect(await screen.findByText(/Evidence source: Signed intake form/)).toBeTruthy()
    expect(screen.getByText(/Evidence kind: manual attestation/)).toBeTruthy()
    expect(screen.getByText(/does not authorize sending/)).toBeTruthy()
    expect(g.getLead).toHaveBeenCalledWith(context, campaignId, leadId, expect.any(AbortSignal))
  })
  it('rejects an account detail returned for another campaign', async () => {
    const g = gateway({ getAccount: vi.fn(async () => ({ id: leadId, campaign_id: leadId, mailbox_id: campaignId, label: 'Foreign', status: 'disabled', version: 1 })) })
    view(`/outreach/campaigns/${campaignId}/accounts/${leadId}`, g)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Foreign')).toBeNull()
  })
  it('shows a disabled account endpoint as unavailable', async () => {
    const g = gateway({ listAccounts: vi.fn(async () => { throw new GatewayError('api', 'temporarily_unavailable', 'disabled', { status: 503 }) }) })
    view(`/outreach/campaigns/${campaignId}/accounts`, g)
    expect(await screen.findByText(/Outreach API unavailable/)).toBeTruthy()
  })
  it('shows no campaign contents or create link after a denied read', async () => {
    const g = gateway({ listCampaigns: vi.fn(async () => { throw new GatewayError('api', 'not_available', 'denied', { status: 404 }) }) })
    view('/outreach/campaigns', g)
    expect(await screen.findByText(/Outreach API unavailable/)).toBeTruthy()
    expect(screen.queryByText('Pilot')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Create draft campaign' })).toBeNull()
  })
  it('labels the server aggregate as consented and unsuppressed', async () => {
    const g = gateway({ listAnalytics: vi.fn(async () => ({ campaign_id: campaignId, lead_count: 4, consented_count: 1 })) })
    view(`/outreach/campaigns/${campaignId}/analytics`, g)
    expect(await screen.findByText(/1 consented and unsuppressed of 4 leads/)).toBeTruthy()
  })
})
