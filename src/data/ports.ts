import type { AiAccess, Campaign, CampaignSchedule, CampaignStep, Connections, Contact, Draft, MailboxConnection } from '@/domain/schema'

// AIDEV-NOTE: The backend seam. Every operation that will hit Resend or our API goes through this interface.
// Swap `gateway` in data/gateway.ts for an HTTP implementation; features and UI stay unchanged.
// Methods return the resulting DTO. The adapter (mock or HTTP) also writes it into the data/store cache, which the UI reads.

export interface NewContact {
  name: string
  email: string
  company: string
  tags: string[]
  consent: Contact['consent']
}

export interface NewCampaign {
  name: string
  identityIds: string[]
  contactIds: string[]
  steps: Array<Omit<CampaignStep, 'id'>>
  schedule: CampaignSchedule
  unsubscribeFooter: string
  status: Extract<Campaign['status'], 'draft' | 'scheduled'>
}

export interface MailroomGateway {
  /** Future: GET /bootstrap (or per-resource queries). */
  load(): Promise<{ recovered: boolean }>
  /** Future: POST to our API, which calls Resend `emails.send`. The prototype never sends anything. */
  sendMessage(draft: Draft): Promise<{ threadId: string }>
  /** Future: POST /contacts/import. */
  importContacts(rows: NewContact[]): Promise<{ added: number }>
  /** Future: POST /campaigns. */
  createCampaign(input: NewCampaign): Promise<{ id: string }>
  /** Future: POST /campaigns/:id/start | pause | resume. The lifecycle event is recorded with the status change. */
  setCampaignStatus(campaignId: string, status: 'running' | 'paused'): Promise<void>
  /** Prototype only: stands in for the backend scheduler processing one sending day. */
  runCampaignBatch(campaignId: string): Promise<{ processed: number; completed: boolean }>
  /** Future: GET /connections. Refreshes mailbox, sender and AI-access state; rejects when it cannot be fetched. */
  loadConnections(): Promise<Connections>
  /** Future: POST /mailboxes begins Google OAuth on the server. The prototype records an address and connects nothing. */
  connectMailbox(address: string): Promise<MailboxConnection>
  /** Future: DELETE /mailboxes/:id revokes the grant. Usage already counted today stays counted for that address. */
  disconnectMailbox(mailboxId: string): Promise<void>
  /** Future: POST /mailboxes/:id/history-import queues a cancellable background job. */
  importMailboxHistory(mailboxId: string): Promise<MailboxConnection>
  /** Future: PATCH /ai/access. The server, not the client, enforces this scope on the local bridge. */
  updateAiAccess(patch: Partial<AiAccess>): Promise<AiAccess>
  /** Future: POST /ai/drafts asks the user's local CLI for a reply. Returns a draft to review; it never sends. */
  prepareAiDraft(threadId: string): Promise<{ draft: Draft }>
  /** Clears stored state and restores the demo dataset. */
  resetAll(): Promise<void>
}
