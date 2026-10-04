import { checkAiDraft, checkNewMailbox, isDemoMailbox, simulatedReplyBody } from '@/domain/connections'
import { buildReply } from '@/domain/mail'
import { aiAccessSchema, type Draft, type MailboxConnection } from '@/domain/schema'
import { delay, formatDateTime, uid } from '@/lib/format'
import type { MailroomGateway } from './ports'
import { useData } from './store'

// AIDEV-NOTE: Mock half of the gateway for Connections + AI. No OAuth, network, key or CLI is touched: state only.

/** Visiting any URL with ?simulate=connections-error fails the first Connections load, to show the retry state. */
const CONNECTIONS_ERROR_FLAG = 'connections-error'
let connectionsFailedOnce = false

type ConnectionsGateway = Pick<MailroomGateway, 'loadConnections' | 'connectMailbox' | 'disconnectMailbox' | 'importMailboxHistory' | 'updateAiAccess' | 'prepareAiDraft'>

export const mockConnections: ConnectionsGateway = {
  async loadConnections() {
    await delay(300)
    if (new URLSearchParams(window.location.search).get('simulate') === CONNECTIONS_ERROR_FLAG && !connectionsFailedOnce) {
      connectionsFailedOnce = true
      throw new Error('Simulated failure: connection details could not be loaded.')
    }
    return useData.getState().connections
  },

  async connectMailbox(address) {
    await delay(400)
    const { connections, setConnections } = useData.getState()
    // Re-validated here as a server would: the limit and duplicate rules must not depend on the form.
    const check = checkNewMailbox(address, connections.mailboxes)
    if (!check.ok) throw new Error(check.reason)
    // Read-only until send permission is granted separately, mirroring distinct Gmail scopes.
    const mailbox: MailboxConnection = { id: uid('mbx'), address: check.address, provider: 'google', status: 'connected', connectedAt: new Date().toISOString(), historyImport: 'not_started', importedConversations: 0, sendEnabled: false }
    setConnections({ ...connections, mailboxes: [...connections.mailboxes, mailbox] })
    return mailbox
  },

  async disconnectMailbox(mailboxId) {
    await delay(250)
    const { connections, identities, setConnections } = useData.getState()
    const mailbox = connections.mailboxes.find((m) => m.id === mailboxId)
    if (!mailbox) throw new Error('That mailbox is no longer connected.')
    if (isDemoMailbox(mailbox, identities)) throw new Error('Demo mailboxes cannot be disconnected in this prototype.')
    // The assistant must lose access with the mailbox, or a stale id would linger in its read scope.
    setConnections({ ...connections, mailboxes: connections.mailboxes.filter((m) => m.id !== mailboxId), ai: { ...connections.ai, readMailboxIds: connections.ai.readMailboxIds.filter((id) => id !== mailboxId) } })
  },

  async importMailboxHistory(mailboxId) {
    await delay(600)
    const { connections, threads, setConnections } = useData.getState()
    const mailbox = connections.mailboxes.find((m) => m.id === mailboxId)
    if (!mailbox) throw new Error('That mailbox is no longer connected.')
    // Honest stand-in: "imported" is the count of fixture conversations already held for this address.
    const updated: MailboxConnection = { ...mailbox, historyImport: 'complete', importedConversations: threads.filter((t) => t.identityId === mailbox.address).length }
    setConnections({ ...connections, mailboxes: connections.mailboxes.map((m) => (m.id === mailboxId ? updated : m)) })
    return updated
  },

  async updateAiAccess(patch) {
    await delay(150)
    const { connections, setConnections } = useData.getState()
    const known = new Set(connections.mailboxes.map((m) => m.id))
    // Parsed, not trusted: a permission must be a real boolean, never a truthy string from a careless caller.
    const parsed = aiAccessSchema.safeParse({ ...connections.ai, ...patch })
    if (!parsed.success) throw new Error('That AI access change is not valid. Nothing was changed.')
    // Scope can only ever name mailboxes that are connected right now.
    const ai = { ...parsed.data, readMailboxIds: [...new Set(parsed.data.readMailboxIds)].filter((id) => known.has(id)) }
    setConnections({ ...connections, ai })
    return ai
  },

  async prepareAiDraft(threadId) {
    await delay(500)
    const state = useData.getState()
    const check = checkAiDraft(state.threads.find((t) => t.id === threadId), state.connections)
    if (!check.ok) throw new Error(check.reason)
    const reply = buildReply(check.thread, 'reply', state.identities, formatDateTime)
    const identity = state.identities.find((i) => i.id === reply.identityId)
    const draft: Draft = { ...reply, id: uid('d'), bcc: [], body: simulatedReplyBody(check.thread), banner: identity?.banner ?? false, updatedAt: new Date().toISOString() }
    // Saved as an ordinary draft: only the person can send it, from the composer, after reading it.
    state.upsertDraft(draft)
    return { draft }
  },
}
