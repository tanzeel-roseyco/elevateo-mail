// Synthetic public test data; never imported by the production application.
import type { ApprovalResult, SendReview, SendStatus } from '@/data/sendContract'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
export const SEND_ID = '00000000-0000-4000-8000-000000000091'
export const DIGEST = 'a'.repeat(64)
export const REVIEW: SendReview = {
  context_id: CD.contextId, authorization_version: CD.authorizationVersion,
  draft_id: CD.draftId, mailbox_id: CD.mailboxId, draft_version: 1,
  sender: { display_name: null, address: 'sender@example.test' },
  to: [{ display_name: '<img src=x onerror=alert(1)>', address: 'recipient@example.test' }],
  subject: '<script>literal subject</script>', body_text: '<img src="https://example.invalid/pixel">\nLiteral body',
  reply_to_thread_id: null, purpose: 'correspondence', consent_basis: 'human_attestation_required',
  attachments: [], attachments_supported: false, policy_revision: '1',
  recipient_checks: [{ index: 0, status: 'ok' }], ready: true, issues: [], review_digest: DIGEST, simulated: true,
}
export const APPROVAL: ApprovalResult = {
  context_id: CD.contextId, authorization_version: CD.authorizationVersion,
  send_id: SEND_ID, draft_id: CD.draftId, approved_version: 1, review_digest: DIGEST,
  approved_at: '2026-10-14T10:00:00Z', simulated: true,
}
export const STATUS: SendStatus = {
  context_id: CD.contextId, authorization_version: CD.authorizationVersion,
  send_id: SEND_ID, mailbox_id: CD.mailboxId, draft_id: CD.draftId, approved_version: 1,
  delivery_status: null, delivery_updated_at: null,
  approved_at: APPROVAL.approved_at, state: 'queued', attempts: 0, first_possible_at: null, retry_deadline_at: null,
  cancel_requested: false, cancellable: true, hold_reason: null, updated_at: APPROVAL.approved_at, simulated: true,
}
