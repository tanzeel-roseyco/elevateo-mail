import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DraftIntentProvider } from '@/app/draftIntent'
import { SendIntentProvider } from '@/app/sendIntent'
import { SessionProvider, useSession, type SessionController } from '@/app/session'
import { Shell } from '@/app/Shell'
import { GatewayError } from '@/data/errors'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import type { MailroomGateway } from '@/data/gateway'
import type { ApprovalResult, SendApprovalInput } from '@/data/sendContract'
import { SendReviewPage } from './SendReviewPage'
import { SendStatusPage } from './SendStatusPage'
import { APPROVAL, REVIEW, STATUS } from './sendTestData'

const reviewPath = `/mailboxes/${CD.mailboxId}/drafts/${CD.draftId}/send-review`
const confirm = () => fireEvent.click(screen.getByRole('checkbox'))
const approve = () => fireEvent.click(screen.getByRole('button', { name: 'Approve simulated send' }))
function gateway(extra: Partial<MailroomGateway> = {}): MailroomGateway {
  const base = createFixtureGateway()
  return { ...base, saveDraft: vi.fn(base.saveDraft), listMailboxes: async (...args) => { const page = await base.listMailboxes(...args); return { ...page, items: page.items.map((mailbox) => ({ ...mailbox, capabilities: { ...mailbox.capabilities, approve_send: true } })) } }, getSendReview: vi.fn(async () => REVIEW), approveDraftSend: vi.fn(async () => APPROVAL), getSendStatus: vi.fn(async () => STATUS), ...extra }
}
function setup(g: MailroomGateway, shell = false) {
  let controller: SessionController | undefined
  function Probe() { controller = useSession(); return null }
  const routes = <><Route path="/mailboxes/:mailboxId/drafts/:draftId/send-review" element={<SendReviewPage />} /><Route path="/mailboxes/:mailboxId/send-intents/:sendId" element={<SendStatusPage />} /></>
  const view = render(<SessionProvider gateway={g}><DraftIntentProvider><SendIntentProvider><Probe /><MemoryRouter initialEntries={[reviewPath]}><Routes>{shell ? <Route element={<Shell />}>{routes}</Route> : routes}</Routes></MemoryRouter></SendIntentProvider></DraftIntentProvider></SessionProvider>)
  return { ...view, controller: () => { if (!controller) throw new Error('Controller not ready'); return controller } }
}
async function ready() { await screen.findByRole('heading', { name: /Review saved draft version/ }) }

describe('Resend consent gate on review', () => {
  beforeEach(() => { window.sessionStorage.clear(); vi.restoreAllMocks() })
  const live = { ...REVIEW, simulated: false }
  it('blocks approval under resend when a recipient has no consent evidence', async () => {
    const g = gateway({ getSendReview: async () => ({ ...live, outbound_mode: 'resend' as const }) })
    setup(g); await ready()
    const alert = screen.getByRole('alert', { name: 'Consent required' })
    expect(alert.textContent).toMatch(/limited to recipients who opted in/)
    expect(alert.textContent).toMatch(/Recipient 1: recipient@example.test has no consent evidence/)
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Approve live send' }) as HTMLButtonElement).disabled).toBe(true)
    expect(g.approveDraftSend).not.toHaveBeenCalled()
  })
  it('blocks simulated marketing without recorded consent', async () => {
    const g = gateway({ getSendReview: async () => ({ ...REVIEW, purpose: 'marketing' as const, consent_basis: 'recorded_consent' as const }) })
    setup(g); await ready()
    expect(screen.getByRole('alert', { name: 'Consent required' }).textContent).toMatch(/Marketing requires recorded opt-in/)
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
    expect(g.approveDraftSend).not.toHaveBeenCalled()
  })
  it('explains consent withdrawal after a simulated marketing review', async () => {
    const review = { ...REVIEW, purpose: 'marketing' as const, consent_basis: 'recorded_consent' as const,
      recipient_checks: REVIEW.recipient_checks.map((recipient) => ({ ...recipient, consent_evidence: true })) }
    const g = gateway({ getSendReview: async () => review,
      approveDraftSend: vi.fn(async () => { throw new GatewayError('api', 'consent_required', 'synthetic', { status: 409 }) }) })
    setup(g); await ready(); confirm(); approve()
    await screen.findByRole('heading', { name: 'Approval blocked: consent required' })
    expect(screen.getByRole('alert').textContent).toMatch(/Recorded opt-in consent is required/)
    expect(screen.getByRole('alert').textContent).not.toMatch(/Live sending through Resend/)
  })
  it('allows approval under mailpit without consent evidence', async () => {
    const g = gateway({ getSendReview: async () => ({ ...live, outbound_mode: 'mailpit' as const }), getSendStatus: async () => ({ ...STATUS, simulated: false }) })
    setup(g); await ready()
    expect(screen.queryByRole('alert', { name: 'Consent required' })).toBeNull()
    expect(screen.getByText('Mailpit test transport - no real inbox')).not.toBeNull()
    confirm(); fireEvent.click(screen.getByRole('button', { name: 'Approve live send' }))
    await screen.findByRole('heading', { name: 'Send intent: queued' })
    expect(g.approveDraftSend).toHaveBeenCalledTimes(1)
  })
  it('shows a server consent_required refusal as a persistent reason with no retry', async () => {
    const g = gateway({ approveDraftSend: vi.fn(async () => { throw new GatewayError('api', 'consent_required', 'synthetic', { status: 409 }) }) })
    setup(g); await ready()
    confirm(); approve()
    const heading = await screen.findByRole('heading', { name: 'Approval blocked: consent required' })
    expect(heading.closest('[role="alert"]')?.textContent).toMatch(/Nothing was queued/)
    expect(screen.queryByRole('button', { name: /approve|retry/i })).toBeNull()
    expect(screen.getByRole('link', { name: 'Record consent evidence' })).not.toBeNull()
  })
})

describe('BE03 saved review and approval', () => {
  beforeEach(() => { window.sessionStorage.clear(); vi.restoreAllMocks() })
  it('renders all literal content, requires explicit attestation, then reads durable queued status', async () => {
    const g = gateway(); setup(g); await ready()
    expect((screen.getByRole('button', { name: 'Approve simulated send' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(REVIEW.subject)).not.toBeNull()
    // CS-02: an unbroken maximum-length subject must wrap inside the card, not widen the page.
    expect(screen.getByText(REVIEW.subject).className).toContain('break-words')
    expect(screen.getByText(/Literal body/)).not.toBeNull()
    expect(document.querySelector('img, script')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('heading'))
    confirm(); approve()
    await screen.findByRole('heading', { name: 'Send intent: queued' })
    expect(g.approveDraftSend).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ csrfToken: expect.any(String) }), CD.draftId, expect.objectContaining({ mailbox_id: CD.mailboxId, expected_version: 1, review_digest: REVIEW.review_digest, correspondence_confirmed: true }), expect.any(AbortSignal))
    expect(g.getSendStatus).toHaveBeenCalledWith(expect.anything(), APPROVAL.send_id, CD.mailboxId, expect.any(AbortSignal))
    expect(screen.getByText(/durably queued/)).not.toBeNull()
  })
  it('requires explicit live approval and preserves live status wording', async () => {
    const g = gateway({ getSendReview: async () => ({ ...REVIEW, simulated: false, outbound_mode: 'resend' as const, recipient_checks: [{ index: 0, status: 'ok' as const, consent_evidence: true }] }), approveDraftSend: vi.fn(async () => ({ ...APPROVAL, simulated: false })), getSendStatus: async () => ({ ...STATUS, simulated: false }) })
    setup(g); await ready()
    expect(screen.getByText('Live email via Resend - sends to real recipients')).not.toBeNull()
    expect(screen.queryByText(/Simulated/)).toBeNull()
    const button = screen.getByRole('button', { name: 'Approve live send' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Approve simulated send' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: /recipients have opted in/ }))
    fireEvent.click(button)
    await screen.findByRole('heading', { name: 'Send intent: queued' })
    expect(screen.getByText('Live email')).not.toBeNull()
    expect(screen.getByText(/Submission attempts: 0/)).not.toBeNull()
  })
  it('shows attachment scan readiness and blocks approval for unscanned bytes', async () => {
    setup(gateway({ getSendReview: async () => ({ ...REVIEW, attachments_supported: true,
      attachments: [{ id: CD.draftId, filename: 'contract.pdf', content_type: 'application/pdf', byte_size: 123, status: 'pending_scan' }],
      ready: false, review_digest: null, issues: [{ code: 'attachment_not_clean', recipient_index: null }],
    }) }))
    await ready()
    expect(screen.getByText(/contract.pdf.*Sending blocked/)).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Approve simulated send' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('retains the original operation/version/digest after a lost response and retries exactly', async () => {
    const calls: SendApprovalInput[] = []
    const g = gateway({ approveDraftSend: vi.fn(async (_ctx, _proof, _id, input) => { calls.push(input); if (calls.length === 1) throw new GatewayError('transport', 'timeout', 'synthetic'); return APPROVAL }) })
    setup(g); await ready(); confirm(); approve()
    const retry = await screen.findByRole('button', { name: 'Retry original approval' })
    fireEvent.click(retry)
    await screen.findByRole('heading', { name: 'Send intent: queued' })
    expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0])
  })
  it.each(['review_stale', 'draft_conflict'] as const)('requires a fresh review after %s without touching draft text', async (code) => {
    const g = gateway({ approveDraftSend: vi.fn(async () => { throw new GatewayError('api', code, 'synthetic', { status: 409 }) }) })
    setup(g); await ready(); confirm(); approve()
    await screen.findByText(/Your draft text is retained/)
    expect(g.saveDraft).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Load fresh review' })); await ready()
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('button', { name: 'Approve simulated send' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('keeps mismatched approval receipts uncertain, with the original binding', async () => {
    const g = gateway({ approveDraftSend: vi.fn(async () => ({ ...APPROVAL, approved_version: 2 })) })
    setup(g); await ready(); confirm(); approve()
    await screen.findByText(/receipt did not match/)
    expect((screen.getByRole('button', { name: 'Retry original approval' }) as HTMLButtonElement).disabled).toBe(false)
    expect(g.getSendStatus).not.toHaveBeenCalled()
  })
  it('renders empty/non-ready review and every recipient without enabling approval', async () => {
    setup(gateway({ getSendReview: async () => ({ ...REVIEW, subject: '', body_text: '', to: [], recipient_checks: [], ready: false, review_digest: null, issues: [{ code: 'recipient_required', recipient_index: null }] }) }))
    await ready(); expect(screen.getByText('(empty message)')).not.toBeNull()
    expect(screen.getByText('(no recipients)')).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Approve simulated send' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('rejects a review belonging to another mailbox before any approval', async () => {
    const g = gateway({ getSendReview: async () => ({ ...REVIEW, mailbox_id: APPROVAL.send_id }) })
    setup(g); await screen.findByText(/review did not match/)
    expect(g.approveDraftSend).not.toHaveBeenCalled()
  })
  it('preserves original retry across context recovery without carrying the old proof', async () => {
    const calls: SendApprovalInput[] = []
    let reads = 0; let sessions = 0
    const proofs: string[] = []
    const base = createFixtureGateway()
    const g = gateway({
      getSession: async (signal) => ({ ...await base.getSession(signal), csrf_token: ++sessions === 1 ? 'old_csrf_token_012345' : 'fresh_csrf_token_012345' }),
      getSendReview: async () => (++reads === 1 ? REVIEW : { ...REVIEW, draft_version: 2, review_digest: 'b'.repeat(64) }),
      listMailboxes: async (...args) => { const page = await base.listMailboxes(...args); return { ...page, items: page.items.map((m) => ({ ...m, capabilities: { ...m.capabilities, approve_send: true } })) } },
      approveDraftSend: async (_ctx, proof, _id, input) => { proofs.push(proof.csrfToken); calls.push(input); if (calls.length === 1) throw new GatewayError('api', 'context_changed', 'synthetic', { status: 409 }); return APPROVAL },
    })
    setup(g, true); await ready(); confirm(); approve()
    const retry = await screen.findByRole('button', { name: 'Retry original approval' })
    expect(screen.getByRole('heading', { name: 'Review saved draft version 2' })).not.toBeNull()
    fireEvent.click(retry); await screen.findByRole('heading', { name: 'Send intent: queued' })
    expect(calls[1]).toEqual(calls[0]); expect(calls[1]?.expected_version).toBe(1); expect(proofs).toEqual(['old_csrf_token_012345', 'fresh_csrf_token_012345'])
  })
  it('renders every recipient in order at the 100-recipient boundary', async () => {
    const recipients = Array.from({ length: 100 }, (_, index) => ({ display_name: `<name ${index}>`, address: `recipient${index}@example.test` }))
    setup(gateway({ getSendReview: async () => ({ ...REVIEW, to: recipients }) })); await ready()
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(recipients.map((recipient) => `${recipient.display_name} ${recipient.address}`))
    expect(document.querySelector('img, script')).toBeNull()
  })
  it('reloads a lost response and explicitly retries the exact original with a fresh proof', async () => {
    const calls: SendApprovalInput[] = []; const proofs: string[] = []
    const g = gateway({ approveDraftSend: vi.fn(async (_ctx, proof, _id, input) => { calls.push(input); proofs.push(proof.csrfToken); if (calls.length === 1) throw new GatewayError('transport', 'timeout', 'synthetic'); return APPROVAL }) })
    const first = setup(g); await ready(); confirm(); approve()
    await screen.findByRole('button', { name: 'Retry original approval' }); first.unmount()
    const base = createFixtureGateway()
    const second = { ...g, getSession: async (signal?: AbortSignal) => ({ ...await base.getSession(signal), csrf_token: 'reload_fresh_csrf_012345' }), getSendReview: async () => ({ ...REVIEW, draft_version: 2, review_digest: 'b'.repeat(64) }) }
    setup(second); await ready()
    expect(calls).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry original approval' }))
    await screen.findByRole('heading', { name: 'Send intent: queued' })
    expect(calls[1]).toEqual(calls[0]); expect(proofs[1]).toBe('reload_fresh_csrf_012345')
  })
  it('fails visibly before POST when retry metadata cannot be stored', async () => {
    const g = gateway(); setup(g); await ready()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
    confirm(); approve()
    await screen.findByText(/No new approval was submitted/)
    expect(g.approveDraftSend).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Approve simulated send' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('drops a late approval after logout and clears retry details', async () => {
    let resolve: ((value: ApprovalResult) => void) | undefined
    const g = gateway({ approveDraftSend: () => new Promise((done) => { resolve = done }) })
    const h = setup(g, true)
    await ready(); confirm(); approve()
    expect(g.approveDraftSend).toBeDefined()
    await act(async () => { await h.controller().signOut('local') })
    if (resolve) await act(async () => { resolve?.(APPROVAL) })
    expect(g.getSendStatus).not.toHaveBeenCalled()
    expect(screen.queryByText(/Literal body/)).toBeNull()
  })
})
