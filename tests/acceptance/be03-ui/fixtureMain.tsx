// SIMULATED browser harness only. Copy into a PRIVATE candidate web tree; never production output.
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { createCollaborationState, createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { GatewayError } from '@/data/errors'
import type { MailroomGateway } from '@/data/gateway'
import type { SendApprovalInput } from '@/data/sendContract'
import { APPROVAL, REVIEW, STATUS } from '@/features/send/sendTestData'
import '@/styles/index.css'

// AIDEV-NOTE: Query mode is fixed per document. The original retry binding is compared, never rebased.
const mode = new URLSearchParams(location.search).get('case') ?? 'happy'
const state = createCollaborationState()
// Browser send examples use valid saved recipients; canonical unsent-draft fixtures remain unchanged.
state.getDraft(CD.draftId, CD.mailboxId).to = [{ display_name: 'Fixture recipient', address: 'recipient@example.test' }]
const base = createFixtureGateway({}, { state })
let original: SendApprovalInput | null = null
let calls = 0
const gateway: MailroomGateway = {
  ...base,
  listMailboxes: async (...args) => {
    const result = await base.listMailboxes(...args)
    return { ...result, items: result.items.map((m) => ({ ...m, capabilities: { ...m.capabilities, approve_send: true } })) }
  },
  getSendReview: async (_ctx, draftId, mailboxId, signal) => {
    await new Promise((resolve) => setTimeout(resolve, 350))
    if (signal?.aborted) throw new GatewayError('transport', 'aborted', 'Synthetic abort')
    if (mode === 'error') throw new GatewayError('api', 'temporarily_unavailable', 'Synthetic unavailable', { status: 503 })
    const draft = state.getDraft(draftId, mailboxId)
    return { ...REVIEW, subject: draft.subject, to: draft.to, body_text: draft.body_text, draft_version: draft.version,
      ...(mode === 'empty' ? { to: [], recipient_checks: [], ready: false, review_digest: null, issues: [{ code: 'recipient_required' as const, recipient_index: null }] } : {}) }
  },
  approveDraftSend: async (_ctx, _proof, draftId, input, signal) => {
    if (signal?.aborted) throw new GatewayError('transport', 'aborted', 'Synthetic abort')
    calls++
    if (mode === 'retry' && calls === 1) {
      original = { ...input }
      throw new GatewayError('transport', 'timeout', 'Synthetic lost response')
    }
    if (original && JSON.stringify(original) !== JSON.stringify(input)) throw new GatewayError('api', 'operation_mismatch', 'Synthetic changed retry', { status: 409 })
    if (mode === 'stale') throw new GatewayError('api', 'review_stale', 'Synthetic stale review', { status: 409 })
    return { ...APPROVAL, draft_id: draftId, approved_version: input.expected_version, review_digest: input.review_digest }
  },
  getSendStatus: async () => {
    await new Promise((resolve) => setTimeout(resolve, 350))
    if (mode === 'status-error') throw new GatewayError('api', 'temporarily_unavailable', 'Synthetic status unavailable', { status: 503 })
    return { ...STATUS, approved_version: state.getDraft(CD.draftId, CD.mailboxId).version,
      ...(mode === 'status-unknown' ? { state: 'unknown' as const, attempts: 1, cancellable: false, first_possible_at: APPROVAL.approved_at } : {}) }
  },
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing harness root')
createRoot(root).render(<div className="flex h-full flex-col"><p role="note" className="bg-warn/15 px-3 py-1 text-center">SIMULATED browser harness — memory only. Nothing is sent or durably stored.</p><div className="min-h-0 flex-1"><App gateway={gateway} /></div></div>)
