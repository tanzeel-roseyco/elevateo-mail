import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
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

describe('BE03 saved review and approval', () => {
  it('renders all literal content, requires explicit attestation, then reads durable queued status', async () => {
    const g = gateway(); setup(g); await ready()
    expect(screen.getByRole('button', { name: 'Approve simulated send' })).toBeDisabled()
    expect(screen.getByText(REVIEW.subject)).toBeInTheDocument()
    expect(screen.getByText(REVIEW.body_text)).toBeInTheDocument()
    expect(document.querySelector('img, script')).toBeNull()
    expect(screen.getByRole('heading')).toHaveFocus()
    confirm(); approve()
    await screen.findByRole('heading', { name: 'Send intent: queued' })
    expect(g.approveDraftSend).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ csrfToken: expect.any(String) }), CD.draftId, expect.objectContaining({ mailbox_id: CD.mailboxId, expected_version: 1, review_digest: REVIEW.review_digest, correspondence_confirmed: true }), expect.any(AbortSignal))
    expect(g.getSendStatus).toHaveBeenCalledWith(expect.anything(), APPROVAL.send_id, CD.mailboxId, expect.any(AbortSignal))
    expect(screen.getByText(/durably queued/)).toBeInTheDocument()
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
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Approve simulated send' })).toBeDisabled()
  })
  it('keeps mismatched approval receipts uncertain, with the original binding', async () => {
    const g = gateway({ approveDraftSend: vi.fn(async () => ({ ...APPROVAL, approved_version: 2 })) })
    setup(g); await ready(); confirm(); approve()
    await screen.findByText(/receipt did not match/)
    expect(screen.getByRole('button', { name: 'Retry original approval' })).toBeEnabled()
    expect(g.getSendStatus).not.toHaveBeenCalled()
  })
  it('renders empty/non-ready review and every recipient without enabling approval', async () => {
    setup(gateway({ getSendReview: async () => ({ ...REVIEW, subject: '', body_text: '', to: [], recipient_checks: [], ready: false, review_digest: null, issues: [{ code: 'recipient_required', recipient_index: null }] }) }))
    await ready(); expect(screen.getByText('(empty message)')).toBeInTheDocument()
    expect(screen.getByText('(no recipients)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve simulated send' })).toBeDisabled()
  })
  it('rejects a review belonging to another mailbox before any approval', async () => {
    const g = gateway({ getSendReview: async () => ({ ...REVIEW, mailbox_id: APPROVAL.send_id }) })
    setup(g); await screen.findByText(/review did not match/)
    expect(g.approveDraftSend).not.toHaveBeenCalled()
  })
  it('preserves original retry across context recovery without carrying the old proof', async () => {
    const calls: SendApprovalInput[] = []
    const base = createFixtureGateway()
    const g = gateway({
      listMailboxes: async (...args) => { const page = await base.listMailboxes(...args); return { ...page, items: page.items.map((m) => ({ ...m, capabilities: { ...m.capabilities, approve_send: true } })) } },
      approveDraftSend: async (_ctx, _proof, _id, input) => { calls.push(input); if (calls.length === 1) throw new GatewayError('api', 'context_changed', 'synthetic', { status: 409 }); return APPROVAL },
    })
    setup(g, true); await ready(); confirm(); approve()
    const retry = await screen.findByRole('button', { name: 'Retry original approval' })
    fireEvent.click(retry); await screen.findByRole('heading', { name: 'Send intent: queued' })
    expect(calls[1]).toEqual(calls[0])
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
    expect(screen.queryByText(REVIEW.body_text)).not.toBeInTheDocument()
  })
})
