import type { Campaign, CampaignSchedule, CampaignStep, Contact, Draft } from '@/domain/schema'

// AIDEV-NOTE: The backend seam. Every operation that will hit Resend or our API goes through this interface.
// Swap `gateway` in data/gateway.ts for an HTTP implementation; features and UI stay unchanged.

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
  /** Clears stored state and restores the demo dataset. */
  resetAll(): Promise<void>
}
