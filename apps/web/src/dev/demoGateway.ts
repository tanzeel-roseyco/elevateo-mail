import { MailboxPageSchema, SessionSchema } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import type { MailroomGateway } from '@/data/gateway'
import { CD_FIXTURE, CollaborationState, type ThreadSeed } from '@/data/fixtures/collaborationState'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'

export const DEMO_MAILBOX_ID = CD_FIXTURE.mailboxId

// AIDEV-NOTE: Demo seeds are separate from canonical security fixtures; all writes remain in memory.
const conversations = [
  ['Maya Chen', 'maya@northstar.example', 'Northstar launch - final copy approval', 'The revised launch copy is ready. Could you review the opening paragraph before Thursday?', true],
  ['Oliver Brooks', 'oliver@studio.example', 'Your onboarding checklist is ready', 'Welcome aboard! I have put together the checklist for our first week working together.', true],
  ['Sofia Rivera', 'sofia@harbor.example', 'Re: Q4 partnership proposal', 'The team loved the proposal. Let us find a time to walk through the next steps.', true],
  ['James Patel', 'james@studio.example', 'Design review notes - October', 'A few thoughtful changes to the new customer experience. The updated notes are attached to our project.', false],
  ['Emma Wilson', 'emma@oak.example', 'A quick thank you', 'Thank you for making the handover so smooth. We are excited to get started!', false],
  ['Noah Kim', 'noah@studio.example', 'Friday team sync - agenda', 'Three things for Friday: launch progress, customer feedback, and next week priorities.', false],
  ['Ava Thompson', 'ava@atlas.example', 'Atlas renewal - next steps', 'Our renewal window opens next month. Can we confirm the scope before the end of this week?', true],
  ['Liam Foster', 'liam@studio.example', 'October customer highlights', 'A few stories worth sharing from this month. The customer team has done brilliant work.', false],
] as const

function threadSeeds(): ThreadSeed[] {
  return conversations.map(([name, address, subject, preview, unread], index) => ({
    summary: {
      id: index === 0 ? CD_FIXTURE.threadId : `00000000-0000-4000-8000-${String(134 + index).padStart(12, '0')}`,
      mailbox_id: DEMO_MAILBOX_ID,
      subject,
      subject_truncated: false,
      sender: { display_name: name, address },
      preview_text: preview,
      last_message_at: `2026-10-14T${String(10 - index).padStart(2, '0')}:15:00Z`,
      unread,
      message_count: 1,
      folder: 'inbox',
      snoozed_until: null,
      starred: false,
    },
    bodyText: ['Hi Alex,', '', preview, '', 'Everything here is a fictitious example for the Elevateo Mail preview.', '', 'Best,', name].join(String.fromCharCode(10)),
  }))
}

export function createDemoGateway(): MailroomGateway {
  const threads = threadSeeds()
  const state = new CollaborationState({ threads })
  for (const thread of threads) {
    if (!thread.summary.unread) state.setReadState(thread.summary.id, DEMO_MAILBOX_ID, true)
  }
  state.saveDraft(CD_FIXTURE.draftId, {
    mailbox_id: DEMO_MAILBOX_ID,
    operation_id: '00000000-0000-4000-8000-000000000261',
    expected_version: 2,
    subject: 'Re: Northstar launch - final copy approval',
    to: [{ display_name: 'Maya Chen', address: 'maya@northstar.example' }],
    body_text: 'Hi Maya,\n\nThanks for sharing the updated copy. The opening paragraph reads well. I have a couple of small suggestions before we wrap up.\n\nBest,\nAlex',
    reply_to_thread_id: CD_FIXTURE.threadId,
  })
  state.saveDraft('00000000-0000-4000-8000-000000000252', {
    mailbox_id: DEMO_MAILBOX_ID,
    operation_id: '00000000-0000-4000-8000-000000000262',
    expected_version: 0,
    subject: 'Welcome to our October update',
    to: [{ display_name: 'Sofia Rivera', address: 'sofia@harbor.example' }],
    body_text: 'Hi Sofia,\n\nHere is a short update on the projects we have been working on this month. Looking forward to hearing your thoughts.\n\nAlex',
    reply_to_thread_id: null,
  })
  const gateway = createFixtureGateway({}, { state })
  return {
    ...gateway,
    // AIDEV-NOTE: Unknown demo URLs must not fall through to the canonical security fixture reader.
    async getThread(context, threadId, mailboxId, query, signal) {
      if (signal?.aborted) throw new GatewayError('transport', 'aborted', 'The request was cancelled.')
      if (mailboxId !== DEMO_MAILBOX_ID || !threads.some((thread) => thread.summary.id === threadId)) {
        throw new GatewayError('api', 'not_available', 'This synthetic item is unavailable.', { status: 404 })
      }
      return gateway.getThread(context, threadId, mailboxId, query, signal)
    },
    async getSession(signal) {
      const session = await gateway.getSession(signal)
      return SessionSchema.parse({ ...session, actor: { ...session.actor, display_name: 'Alex Morgan' }, organization: { ...session.organization, name: 'Elevateo Studio' } })
    },
    async listMailboxes(context, query, signal) {
      const page = await gateway.listMailboxes(context, query, signal)
      return MailboxPageSchema.parse({ ...page, items: [{ id: DEMO_MAILBOX_ID, display_name: 'Team inbox', display_address: 'hello@elevateo.example', capabilities: { read: true, compose: true, approve_send: false, manage_members: true } }] })
    },
  }
}
