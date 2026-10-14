import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { DraftIntentProvider } from '@/app/draftIntent'
import { SendIntentProvider } from '@/app/sendIntent'
import { SessionProvider } from '@/app/session'
import { Shell } from '@/app/Shell'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createCollaborationState, createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { DraftEditorPage } from '@/features/drafts/DraftEditorPage'
import { SendReviewPage } from './SendReviewPage'
import { SendStatusPage } from './SendStatusPage'
import { APPROVAL, REVIEW, STATUS } from './sendTestData'

describe('saved draft to simulated queued intent', () => {
  it('offers review only after saving current edits and approves exactly the reviewed version', async () => {
    const state = createCollaborationState(); const base = createFixtureGateway({}, { state })
    const approveDraftSend = vi.fn(async () => ({ ...APPROVAL, approved_version: 3 }))
    const g = { ...base, approveDraftSend,
      listMailboxes: async (...args: Parameters<typeof base.listMailboxes>) => { const page = await base.listMailboxes(...args); return { ...page, items: page.items.map((mailbox) => ({ ...mailbox, capabilities: { ...mailbox.capabilities, approve_send: true } })) } },
      getSendReview: async () => { const draft = state.getDraft(CD.draftId, CD.mailboxId); return { ...REVIEW, subject: draft.subject, to: draft.to, body_text: draft.body_text, draft_version: draft.version } },
      getSendStatus: async () => ({ ...STATUS, approved_version: 3 }),
    }
    render(<SessionProvider gateway={g}><DraftIntentProvider><SendIntentProvider><MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/drafts/${CD.draftId}`]}><Routes><Route element={<Shell />}>
      <Route path="/mailboxes/:mailboxId/drafts/:draftId" element={<DraftEditorPage />} />
      <Route path="/mailboxes/:mailboxId/drafts/:draftId/send-review" element={<SendReviewPage />} />
      <Route path="/mailboxes/:mailboxId/send-intents/:sendId" element={<SendStatusPage />} />
    </Route></Routes></MemoryRouter></SendIntentProvider></DraftIntentProvider></SessionProvider>)
    const subject = await screen.findByLabelText('Subject')
    await screen.findByRole('link', { name: 'Review simulated send' })
    fireEvent.change(subject, { target: { value: 'Saved current text' } })
    expect(screen.queryByRole('link', { name: 'Review simulated send' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Review simulated send' }))
    await screen.findByRole('heading', { name: 'Review saved draft version 3' })
    expect(screen.getByText('Saved current text')).not.toBeNull()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Approve simulated send' }))
    await screen.findByRole('heading', { name: 'Send intent: queued' })
    expect(approveDraftSend).toHaveBeenCalledWith(expect.anything(), expect.anything(), CD.draftId, expect.objectContaining({ expected_version: 3, review_digest: REVIEW.review_digest }), expect.any(AbortSignal))
  })
})
