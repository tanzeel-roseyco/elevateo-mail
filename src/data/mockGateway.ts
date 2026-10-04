import { identityDomain } from '@/domain/identities'
import { batchSize, isSendable, validateSend } from '@/domain/rules'
import type { ActivityEvent, Address, Campaign, CampaignRecipient, Contact, Data, Message, Thread } from '@/domain/schema'
import { delay, uid } from '@/lib/format'
import { mockConnections } from './mockConnections'
import type { MailroomGateway } from './ports'
import { createSeed } from './seed'
import { loadPersisted, STORAGE_KEY, useData } from './store'

// AIDEV-NOTE: In-browser stand-in for the backend. Simulates latency and failures so loading/error UI is real.
// Nothing here talks to a network; "sending" only writes to the local store.

/** Addresses on this domain make sendMessage reject, to demonstrate the failure path. */
export const FAILING_DOMAIN = '@fail.test'
/** Visiting any URL with ?simulate=load-error fails the first load attempt. */
const LOAD_ERROR_FLAG = 'load-error'

let loadFailedOnce = false

function toAddress(email: string, contacts: Contact[]): Address {
  const contact = contacts.find((c) => c.email.toLowerCase() === email.toLowerCase())
  return { name: contact?.name ?? email, email }
}

function event(partial: Omit<ActivityEvent, 'id' | 'at' | 'text'> & { text?: string }): ActivityEvent {
  return { text: '', ...partial, id: uid('e'), at: new Date().toISOString() }
}

export const mockGateway: MailroomGateway = {
  ...mockConnections,

  async load() {
    await delay(350)
    if (new URLSearchParams(window.location.search).get('simulate') === LOAD_ERROR_FLAG && !loadFailedOnce) {
      loadFailedOnce = true
      throw new Error('Simulated load failure. Retry to continue.')
    }
    const { data, recovered } = loadPersisted(localStorage, Date.now())
    useData.getState().replaceAll(data)
    return { recovered }
  },

  async sendMessage(draft) {
    await delay(450)
    const state = useData.getState()
    // Re-validated here because the gateway is the last line of defence for suppression, as a server would be.
    const check = validateSend(draft, state.contacts, state.identities)
    if (!check.ok) throw new Error(check.errors[0]?.message ?? 'The message is not ready to send.')
    if ([...draft.to, ...draft.cc, ...draft.bcc].some((e) => e.toLowerCase().endsWith(FAILING_DOMAIN))) {
      throw new Error('Simulated provider failure: the message was not sent. Your draft is safe.')
    }
    const identity = state.identities.find((i) => i.id === draft.identityId)
    const domain = identityDomain(draft.identityId)
    if (!identity || !domain) throw new Error('Unknown sender identity.')

    const message: Message = {
      id: uid('m'),
      from: { name: identity.displayName, email: identity.id },
      to: draft.to.map((e) => toAddress(e, state.contacts)),
      cc: draft.cc.map((e) => toAddress(e, state.contacts)),
      body: draft.body,
      at: new Date().toISOString(),
      direction: 'out',
      attachments: draft.attachments,
      signature: identity.signature || undefined,
      bannerDomain: draft.banner ? domain : undefined,
      unsubscribeFooter: draft.campaignId ? (state.campaigns.find((c) => c.id === draft.campaignId)?.unsubscribeFooter ?? state.settings.unsubscribeFooter) : undefined,
    }
    const existing = draft.threadId ? state.threads.find((t) => t.id === draft.threadId) : undefined
    const threadId = existing?.id ?? uid('t')
    const threads: Thread[] = existing
      ? state.threads.map((t) => (t.id === threadId ? { ...t, unread: false, messages: [...t.messages, message] } : t))
      : [{ id: threadId, subject: draft.subject, folder: 'sent', starred: false, unread: false, identityId: identity.id, campaignId: draft.campaignId, messages: [message] }, ...state.threads]
    // The simulator reports immediate delivery; a real integration would wait for Resend's delivered webhook.
    const events = [...draft.to, ...draft.cc, ...draft.bcc].flatMap((email) => [
      event({ kind: 'delivered', domain, identityId: identity.id, email, campaignId: draft.campaignId, threadId }),
      event({ kind: 'sent', domain, identityId: identity.id, email, campaignId: draft.campaignId, threadId }),
    ])
    useData.setState({ threads, events: [...events, ...state.events], drafts: state.drafts.filter((d) => d.id !== draft.id) })
    return { threadId }
  },

  async importContacts(rows) {
    await delay(500)
    const state = useData.getState()
    const known = new Set(state.contacts.map((c) => c.email.toLowerCase()))
    const added: Contact[] = rows
      .filter((r) => !known.has(r.email.toLowerCase()))
      .map((r) => ({ id: uid('c'), name: r.name, email: r.email.toLowerCase(), company: r.company, tags: r.tags, consent: r.consent, consentSource: 'CSV import', subscription: 'subscribed' }))
    useData.setState({ contacts: [...added, ...state.contacts] })
    return { added: added.length }
  },

  async createCampaign(input) {
    await delay(400)
    const state = useData.getState()
    const sendable = new Set(state.contacts.filter(isSendable).map((c) => c.id))
    const id = uid('cmp')
    const sender = input.identityIds[0]
    const domain = sender ? identityDomain(sender) : null
    if (!sender || !domain) throw new Error('A campaign needs at least one sender identity.')
    // One campaign sends from one brand: every sender must be a configured identity on the same domain.
    const known = new Set(state.identities.map((i) => i.id))
    if (!input.identityIds.every((i) => known.has(i) && identityDomain(i) === domain)) {
      throw new Error('Campaign senders must be configured identities on a single domain.')
    }
    const campaign: Campaign = {
      id,
      name: input.name.trim(),
      status: input.status,
      identityIds: input.identityIds,
      steps: input.steps.map((s) => ({ ...s, id: uid('s') })),
      // Suppressed contacts are dropped here even if a caller passes them in.
      recipients: input.contactIds.filter((cid) => sendable.has(cid)).map((contactId) => ({ contactId, delivery: 'pending', replied: false, unsubscribed: false, at: null })),
      schedule: input.schedule,
      unsubscribeFooter: input.unsubscribeFooter,
      createdAt: new Date().toISOString(),
    }
    const created = event({ kind: 'campaign', domain, identityId: sender, email: '', campaignId: id, threadId: null, text: input.status === 'scheduled' ? 'Campaign scheduled' : 'Campaign created as draft' })
    useData.setState({ campaigns: [campaign, ...state.campaigns], events: [created, ...state.events] })
    return { id }
  },

  async setCampaignStatus(campaignId, status) {
    await delay(200)
    const state = useData.getState()
    const campaign = state.campaigns.find((c) => c.id === campaignId)
    if (!campaign) throw new Error('Campaign not found.')
    const sender = campaign.identityIds[0]
    const domain = sender ? identityDomain(sender) : null
    if (!sender || !domain) throw new Error('The campaign has no sender identity.')
    const allowed = status === 'paused' ? campaign.status === 'running' : campaign.status !== 'running' && campaign.status !== 'completed'
    if (!allowed) throw new Error(`A ${campaign.status} campaign cannot be ${status === 'paused' ? 'paused' : 'started'}.`)
    const text = status === 'paused' ? 'Campaign paused' : campaign.status === 'paused' ? 'Campaign resumed' : 'Campaign started'
    // Status and its lifecycle event change together, so the activity history never misses a transition.
    useData.setState({
      campaigns: state.campaigns.map((c) => (c.id === campaignId ? { ...c, status } : c)),
      events: [event({ kind: 'campaign', domain, identityId: sender, email: '', campaignId, threadId: null, text }), ...state.events],
    })
  },

  async runCampaignBatch(campaignId) {
    await delay(600)
    const state = useData.getState()
    const campaign = state.campaigns.find((c) => c.id === campaignId)
    if (!campaign) throw new Error('Campaign not found.')
    if (campaign.status !== 'running') throw new Error('Only a running campaign can send.')
    const sender = campaign.identityIds[0]
    const domain = sender ? identityDomain(sender) : null
    if (!sender || !domain) throw new Error('The campaign has no sender identity.')

    const contactsById = new Map(state.contacts.map((c) => [c.id, c]))
    const events: ActivityEvent[] = []
    let budget = batchSize(campaign)
    let processed = 0
    const recipients = campaign.recipients.map((r, index): CampaignRecipient => {
      if (r.delivery !== 'pending' || budget === 0) return r
      const contact = contactsById.get(r.contactId)
      // Suppression is re-checked at dispatch: a contact may have unsubscribed after the campaign was built.
      if (!contact || !isSendable(contact)) return { ...r, delivery: 'skipped', at: new Date().toISOString() }
      budget--
      processed++
      const identityId = campaign.identityIds[index % campaign.identityIds.length] ?? sender
      const base = { domain, identityId, email: contact.email, campaignId, threadId: null }
      events.push(event({ ...base, kind: 'delivered' }), event({ ...base, kind: 'sent' }))
      return { ...r, delivery: 'delivered', at: new Date().toISOString() }
    })
    const completed = recipients.every((r) => r.delivery !== 'pending')
    if (completed) events.unshift(event({ kind: 'campaign', domain, identityId: sender, email: '', campaignId, threadId: null, text: 'Campaign completed' }))
    useData.setState({
      campaigns: state.campaigns.map((c) => (c.id === campaignId ? { ...c, recipients, status: completed ? 'completed' : c.status } : c)),
      events: [...events, ...state.events],
    })
    return { processed, completed }
  },

  async resetAll() {
    await delay(300)
    const data: Data = createSeed(Date.now())
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage blocked: the in-memory reset below still applies, and persistence reports write failures itself.
    }
    useData.getState().replaceAll(data)
  },
}
