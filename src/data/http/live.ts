import { z } from 'zod'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { canApprove, canCancel, checkSendContent, isSettled, newSendRecord, nextPollDelay, sendRecordSchema, type SendContent, type SendRecord } from '@/domain/sendLifecycle'
import type { Capabilities, MailboxPermissions, MailboxQuota, MessageBody, MessageCursor, MessageSummary, ServerMailbox } from './contract'
import { ApiFailure } from './httpClient'
import type { ServerGateway } from './ports'

// AIDEV-NOTE: The single owner of API-backed state. Components read this store and call these actions; the HTTP
// adapter returns DTOs and writes nothing. No other module may call setState on it. There is no mock fallback:
// when the server cannot be reached the state says so.

export const PAGE_LIMIT = 50
const MAX_CACHED_BODIES = 20
const MAX_RECORDS = 100
/** At most this many unfinished requests are re-inspected when the app starts; the rest wait until they are opened. */
const MAX_BOOT_REFRESH = 20
const TOKEN_KEY = 'elevateo:session'
const SENDS_PREFIX = 'elevateo:sends:'
/** Written on sign-out so other tabs of the same account sign out too. Holds a namespace, never a token. */
const SIGNOUT_KEY = 'elevateo:signed-out'
const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{32,256}$/

export type Loadable<T> = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string }

export type SessionState =
  /** `reason` says why the last sign-in attempt failed, if one did. */
  | { status: 'signed_out'; reason?: string }
  /** The server said the session is no longer valid. Cached account data has been dropped from memory. */
  | { status: 'expired' }
  | { status: 'loading' }
  | { status: 'ready' }
  /** The server could not be reached or did not speak the contract. Nothing is shown in its place. */
  | { status: 'unavailable'; message: string }

export interface MessageList {
  mailboxId: string
  /** The server cursor that opened the page on screen; `null` is the newest page. The caller keeps it in the URL. */
  cursor: MessageCursor | null
  page: Loadable<{ items: MessageSummary[]; next: MessageCursor | null }>
}

export interface LiveState {
  session: SessionState
  capabilities: Capabilities | null
  mailboxes: ServerMailbox[]
  quotas: Record<string, Loadable<MailboxQuota>>
  list: MessageList | null
  /** Recently opened bodies, newest last, keyed `mailboxId/messageId`. Bounded so a long session cannot grow it. */
  bodies: Array<{ key: string; body: Loadable<MessageBody> }>
  sends: SendRecord[]
  /** Keys whose automatic checking stopped at its limit while still queued or sending. */
  stalled: string[]
  /** True when this browser refused to store send records, so they cannot be recovered after a reload. */
  unsaved: boolean
}

const EMPTY: Omit<LiveState, 'session'> = { capabilities: null, mailboxes: [], quotas: {}, list: null, bodies: [], sends: [], stalled: [], unsaved: false }

export interface LiveDeps {
  gateway: ServerGateway
  /** Holds the session token for this tab only. */
  session: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  /** Holds send records, shared by tabs of the same browser. */
  local: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>
  /** Maps a token to a storage namespace without revealing it. */
  namespace(token: string): Promise<string>
  now(): number
  newKey(): string
}

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : 'Something went wrong. Nothing was changed.')
const recordsSchema = z.array(sendRecordSchema)

export interface Live {
  store: StoreApi<LiveState>
  getToken(): string | null
  /** Restores a session kept by this tab, if any. Call once at start. */
  start(): Promise<void>
  signIn(token: string): Promise<{ ok: true } | { ok: false; reason: string }>
  signOut(): void
  retry(): Promise<void>
  refreshMailboxes(): Promise<void>
  loadQuota(mailboxId: string): Promise<void>
  setPermissions(mailboxId: string, permissions: MailboxPermissions): Promise<void>
  /** Loads one page: the newest, or the one a server-issued cursor points at. */
  openList(mailboxId: string, cursor?: MessageCursor | null): Promise<void>
  reloadPage(): Promise<void>
  openBody(mailboxId: string, messageId: string): Promise<void>
  saveDraft(key: string | null, content: SendContent): string
  submit(key: string): Promise<void>
  approve(key: string): Promise<void>
  cancel(key: string): Promise<void>
  refresh(key: string): Promise<void>
  /** Cancels a request that has not been handed to the provider and returns the key of an editable copy. */
  editAsNew(key: string): Promise<string>
  forget(key: string): void
  /** Starts bounded status checks while a view is open. The returned function stops them. */
  watch(key: string): () => void
  /** Call for every `storage` event: picks up records changed, or a sign-out made, in another tab. */
  onStorageEvent(key: string | null, newValue: string | null): void
}

export function createLive(deps: LiveDeps): Live {
  // Starts as loading: until start() has looked for a session kept by this tab, nobody is known to be signed out.
  const store = createStore<LiveState>(() => ({ session: { status: 'loading' }, ...EMPTY }))
  const { gateway } = deps
  let token: string | null = null
  let ns: string | null = null
  // Bumped whenever the account changes. A response that started under an older epoch belongs to someone else's
  // session and is dropped instead of being written.
  let epoch = 0
  const current = (started: number): boolean => started === epoch

  // ---- persistence of send records -------------------------------------------------------------------------
  const sendsKey = (): string | null => (ns ? `${SENDS_PREFIX}${ns}` : null)
  function readRecords(): SendRecord[] {
    const key = sendsKey()
    if (!key) return []
    try {
      const parsed = recordsSchema.safeParse(JSON.parse(deps.local.getItem(key) ?? '[]'))
      return parsed.success ? parsed.data : []
    } catch {
      return []
    }
  }
  // Whether the last write reached storage. submit() will not contact the server for the first time when it did not.
  let persisted = true
  function writeRecords(sends: SendRecord[]): void {
    store.setState({ sends })
    const key = sendsKey()
    if (!key) return
    try {
      deps.local.setItem(key, JSON.stringify(sends))
      persisted = true
    } catch {
      // Storage full or blocked: drafts still work in this tab, but would not survive a reload.
      persisted = false
      store.setState({ unsaved: true })
    }
  }
  const find = (key: string): SendRecord | undefined => store.getState().sends.find((r) => r.key === key)
  function patch(key: string, change: Partial<SendRecord>): void {
    // Re-read storage first so a change made by another tab is not overwritten with this tab's older copy.
    const latest = mergeStored()
    writeRecords(latest.map((r) => (r.key === key ? { ...r, ...change } : r)))
    // A watched request that just became queued (approved here or elsewhere) starts being checked.
    if (watchers.get(key) && !timers.has(key)) schedule(key)
  }
  /** Records in storage win over memory, except that memory keeps records storage does not have yet. */
  function mergeStored(): SendRecord[] {
    const stored = readRecords()
    const known = new Set(stored.map((r) => r.key))
    return [...store.getState().sends.filter((r) => !known.has(r.key)), ...stored]
  }
  function removeOtherNamespaces(): void {
    const stale: string[] = []
    for (let i = 0; i < deps.local.length; i++) {
      const key = deps.local.key(i)
      if (key?.startsWith(SENDS_PREFIX) && key !== sendsKey()) stale.push(key)
    }
    stale.forEach((key) => deps.local.removeItem(key))
  }

  // ---- session ---------------------------------------------------------------------------------------------
  function dropAccountData(session: SessionState): void {
    epoch++
    stopAllPolling()
    store.setState({ session, ...EMPTY })
  }
  /** Any 401 ends the session everywhere in this tab: cached account data must not outlive it. */
  function guard(error: unknown): never {
    if (error instanceof ApiFailure && error.kind === 'unauthorized' && token) {
      token = null
      ns = null
      deps.session.removeItem(TOKEN_KEY)
      dropAccountData({ status: 'expired' })
    }
    throw error
  }
  async function call<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      return guard(error)
    }
  }

  async function bootstrap(): Promise<void> {
    const started = epoch
    store.setState({ session: { status: 'loading' } })
    try {
      const [capabilities, mailboxes] = await call(() => Promise.all([gateway.capabilities(), gateway.listMailboxes()]))
      if (!current(started)) return
      // Only now is the account known to be real: another account's records must not stay readable beside it.
      removeOtherNamespaces()
      store.setState({ session: { status: 'ready' }, capabilities, mailboxes, sends: readRecords() })
      void recoverUnfinished(started)
    } catch (error) {
      if (!current(started)) return
      store.setState({ session: { status: 'unavailable', message: failureMessage(error) } })
    }
  }

  // Counts sign-in attempts so one that was overtaken reports that, instead of reading the newer attempt's result.
  let signInAttempt = 0
  async function adopt(next: string): Promise<void> {
    // Each attempt takes its own epoch before waiting, so of two overlapping sign-ins only the later one proceeds.
    const started = ++epoch
    token = next
    ns = null
    const derived = await deps.namespace(next)
    if (!current(started)) return
    ns = derived
    await bootstrap()
  }

  // ---- send requests ---------------------------------------------------------------------------------------
  async function recoverUnfinished(started: number): Promise<void> {
    const unfinished = store.getState().sends.filter((r) => r.status === 'unconfirmed' || (r.intentId !== null && !isSettled(r.status)))
    for (const record of unfinished.slice(0, MAX_BOOT_REFRESH)) {
      if (!current(started)) return
      await refresh(record.key).catch(() => undefined)
    }
  }

  async function inspect(key: string): Promise<void> {
    const record = find(key)
    if (!record?.intentId) return
    const started = epoch
    const intent = await call(() => gateway.getSendRequest(record.intentId!))
    if (!current(started)) return
    const before = find(key)?.status
    patch(key, { status: intent.status, revision: intent.revision, errorCode: intent.errorCode, correlationId: intent.correlationId, checkedAt: new Date(deps.now()).toISOString() })
    if (before !== intent.status) rereadQuota(record.content.mailboxId)
  }

  /** Capacity moves when a request is held, released or accepted, so a figure already on screen is read again. */
  function rereadQuota(mailboxId: string): void {
    if (store.getState().quotas[mailboxId]) void loadQuota(mailboxId)
  }

  async function submit(key: string): Promise<void> {
    const record = find(key)
    if (!record || (record.status !== 'local_draft' && record.status !== 'unconfirmed')) return
    const check = checkSendContent(record.content)
    if (!check.ok) return patch(key, { notice: check.errors[0]?.message ?? 'The message is not ready.' })
    // Saved as "unconfirmed" BEFORE the request leaves: if the answer is lost, a reload finds this same key and
    // asks again with identical content, which the server treats as the same request.
    patch(key, { content: check.content, status: 'unconfirmed', notice: null })
    if (!persisted && record.status === 'local_draft') {
      // The key could not be stored, so a lost answer could not be recovered after a reload: nothing is sent at all.
      const notice = 'This browser could not store the request, so it could not be recovered if the answer were lost. Nothing was sent to the server. Free some browser storage and try again.'
      store.setState((s) => ({ sends: s.sends.map((r) => (r.key === key ? { ...r, status: 'local_draft' as const, notice } : r)) }))
      return
    }
    const started = epoch
    try {
      const created = await call(() => gateway.createSendRequest(key, check.content))
      if (!current(started)) return
      patch(key, { intentId: created.id, revision: created.revision, status: created.status, notice: null, checkedAt: new Date(deps.now()).toISOString() })
      if (created.status !== 'draft') await inspect(key)
    } catch (error) {
      if (!current(started)) return
      const failure = error instanceof ApiFailure ? error : null
      // A definite refusal of the input means nothing was saved: it is an editable draft again.
      const definite = failure?.kind === 'refused' && failure.code !== 'idempotency_conflict' && !failure.outcomeUncertain
      patch(key, definite ? { status: 'local_draft', notice: failureMessage(error) } : { notice: `${failureMessage(error)} It is not known whether the server saved this request. Check again: the same request is looked up, not a new one.` })
    }
  }

  async function approve(key: string): Promise<void> {
    const record = find(key)
    if (!record?.intentId || !record.revision || !canApprove(record.status)) return
    const started = epoch
    try {
      await call(() => gateway.approveSendRequest(record.intentId!, record.revision!))
      if (!current(started)) return
      patch(key, { status: 'pending', notice: null })
      rereadQuota(record.content.mailboxId)
      // A pause on the server decides whether "queued" will move; read it again rather than trust the sign-in value.
      void call(() => gateway.capabilities()).then(
        (capabilities) => current(started) && store.setState({ capabilities }),
        () => undefined,
      )
      await inspect(key).catch(() => undefined)
    } catch (error) {
      if (!current(started)) return
      const failure = error instanceof ApiFailure ? error : null
      // Approval is not repeatable. Whatever went wrong, the saved state is read back rather than approving again.
      const inspected = await inspect(key).then(
        () => true,
        () => false,
      )
      if (!current(started)) return
      const now = find(key)
      if (inspected && now && now.status !== 'draft') return patch(key, { notice: null })
      patch(key, { notice: failure?.kind === 'refused' && inspected ? failureMessage(error) : `${failureMessage(error)} It is not known whether the approval was recorded. Check its status before doing anything else.` })
    }
  }

  async function cancel(key: string): Promise<void> {
    const record = find(key)
    if (!record) return
    if (record.status === 'local_draft') return forget(key)
    if (!record.intentId || !canCancel(record.status)) return
    const started = epoch
    try {
      await call(() => gateway.cancelSendRequest(record.intentId!))
      if (!current(started)) return
      patch(key, { status: 'cancelled', notice: null })
      rereadQuota(record.content.mailboxId)
      await inspect(key).catch(() => undefined)
    } catch (error) {
      if (!current(started)) return
      await inspect(key).catch(() => undefined)
      if (!current(started)) return
      if (find(key)?.status !== 'cancelled') patch(key, { notice: failureMessage(error) })
    }
  }

  async function refresh(key: string): Promise<void> {
    const record = find(key)
    if (!record) return
    if (record.status === 'unconfirmed') return submit(key)
    if (!record.intentId) return
    const started = epoch
    try {
      await inspect(key)
      if (current(started) && find(key)?.notice?.includes('not known')) patch(key, { notice: null })
    } catch (error) {
      if (current(started)) patch(key, { notice: `Status could not be checked: ${failureMessage(error)}` })
      throw error
    }
  }

  function forget(key: string): void {
    stopPolling(key)
    writeRecords(mergeStored().filter((r) => r.key !== key))
  }

  function saveDraft(key: string | null, content: SendContent): string {
    const existing = key ? find(key) : undefined
    if (existing) {
      // Only an unsubmitted draft can change. Anything the server may hold is immutable.
      if (existing.status === 'local_draft') patch(existing.key, { content, notice: null })
      return existing.key
    }
    const record = newSendRecord(deps.newKey(), content, new Date(deps.now()).toISOString())
    const all = [record, ...mergeStored()]
    // Oldest settled records make room first; an unfinished request is never dropped.
    const overflow = all.length - MAX_RECORDS
    const droppable = overflow > 0 ? new Set(all.filter((r) => isSettled(r.status)).slice(-overflow).map((r) => r.key)) : new Set<string>()
    writeRecords(all.filter((r) => !droppable.has(r.key)))
    return record.key
  }

  function signOut(): void {
    const key = sendsKey()
    if (key) deps.local.removeItem(key)
    deps.session.removeItem(TOKEN_KEY)
    token = null
    ns = null
    dropAccountData({ status: 'signed_out' })
  }

  // ---- polling ---------------------------------------------------------------------------------------------
  const watchers = new Map<string, number>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const attempts = new Map<string, number>()
  function stopPolling(key: string): void {
    const timer = timers.get(key)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(key)
  }
  function stopAllPolling(): void {
    for (const key of [...timers.keys()]) stopPolling(key)
    watchers.clear()
    attempts.clear()
  }
  function schedule(key: string): void {
    stopPolling(key)
    const record = find(key)
    if (!record || !watchers.get(key)) return
    const attempt = attempts.get(key) ?? 0
    const delay = nextPollDelay(record.status, attempt)
    const stalled = store.getState().stalled
    if (delay === null) {
      // Still queued or sending after the last allowed check: say so, and leave further checks to the person.
      const waiting = record.status === 'pending' || record.status === 'dispatching'
      if (waiting !== stalled.includes(key)) store.setState({ stalled: waiting ? [...stalled, key] : stalled.filter((k) => k !== key) })
      return
    }
    timers.set(
      key,
      setTimeout(() => {
        // The status may have changed while this timer was waiting (a manual check, another tab). If it no longer
        // calls for automatic checks, such as an unknown outcome, none is made.
        const latest = find(key)
        if (!latest || nextPollDelay(latest.status, attempt) === null) return schedule(key)
        attempts.set(key, attempt + 1)
        void refresh(key)
          .catch(() => undefined)
          .then(() => schedule(key))
      }, delay),
    )
  }

  async function loadQuota(mailboxId: string): Promise<void> {
    const started = epoch
    const previous = store.getState().quotas[mailboxId]
    // Keep the last server figure visible while re-reading it; a first read shows a loading state.
    if (previous?.status !== 'ready') store.setState((s) => ({ quotas: { ...s.quotas, [mailboxId]: { status: 'loading' } } }))
    try {
      const data = await call(() => gateway.mailboxQuota(mailboxId))
      if (current(started)) store.setState((s) => ({ quotas: { ...s.quotas, [mailboxId]: { status: 'ready', data } } }))
    } catch (error) {
      // A stale figure is not shown as current: capacity that cannot be read is reported as unknown.
      if (current(started)) store.setState((s) => ({ quotas: { ...s.quotas, [mailboxId]: { status: 'error', message: failureMessage(error) } } }))
    }
  }

  // Only the most recent page read may write its answer: an older one arriving late would show a stale page.
  let pageRead = 0
  async function loadPage(list: MessageList): Promise<void> {
    const started = epoch
    const read = ++pageRead
    store.setState({ list: { ...list, page: { status: 'loading' } } })
    const same = (): boolean => current(started) && read === pageRead
    try {
      const data = await call(() => gateway.listMessages({ mailboxId: list.mailboxId, cursor: list.cursor, limit: PAGE_LIMIT }))
      if (same()) store.setState({ list: { ...list, page: { status: 'ready', data } } })
    } catch (error) {
      if (same()) store.setState({ list: { ...list, page: { status: 'error', message: failureMessage(error) } } })
    }
  }

  return {
    store,
    getToken: () => token,

    async start() {
      const saved = deps.session.getItem(TOKEN_KEY)
      if (saved && TOKEN_PATTERN.test(saved)) await adopt(saved)
      else store.setState({ session: { status: 'signed_out' } })
    },

    async signIn(raw) {
      const next = raw.trim()
      if (!TOKEN_PATTERN.test(next)) return { ok: false, reason: 'That is not a session token: it should be 32 to 256 letters, digits, hyphens or underscores.' }
      const attempt = ++signInAttempt
      dropAccountData({ status: 'loading' })
      await adopt(next)
      if (attempt !== signInAttempt) return { ok: false, reason: 'Another sign-in replaced this one.' }
      const session = store.getState().session
      if (session.status === 'ready') {
        deps.session.setItem(TOKEN_KEY, next)
        return { ok: true }
      }
      if (session.status === 'expired') {
        const reason = 'The server did not accept that session. It may have expired or been revoked.'
        store.setState({ session: { status: 'signed_out', reason } })
        return { ok: false, reason }
      }
      // Unreachable server: keep the token for this tab so "Try again" can use it, but show nothing as loaded.
      deps.session.setItem(TOKEN_KEY, next)
      return { ok: false, reason: session.status === 'unavailable' ? session.message : 'The session could not be started.' }
    },

    signOut() {
      const signedOut = ns
      signOut()
      try {
        if (signedOut) deps.local.setItem(SIGNOUT_KEY, `${signedOut}:${deps.now()}`)
      } catch {
        // Other tabs cannot be told; each still loses access when its own session ends.
      }
    },

    async retry() {
      if (token) await bootstrap()
    },

    async refreshMailboxes() {
      const started = epoch
      const mailboxes = await call(() => gateway.listMailboxes())
      if (current(started)) store.setState({ mailboxes })
    },

    loadQuota,

    async setPermissions(mailboxId, permissions) {
      const started = epoch
      try {
        await call(() => gateway.updateMailboxPermissions(mailboxId, permissions))
      } finally {
        // Success or failure, the list shown afterwards is what the server now holds, not what was requested.
        if (current(started)) {
          const mailboxes = await call(() => gateway.listMailboxes()).catch(() => null)
          if (mailboxes && current(started)) store.setState({ mailboxes })
        }
      }
    },

    openList: (mailboxId, cursor = null) => loadPage({ mailboxId, cursor, page: { status: 'loading' } }),
    async reloadPage() {
      const list = store.getState().list
      if (list) await loadPage(list)
    },

    async openBody(mailboxId, messageId) {
      const key = `${mailboxId}/${messageId}`
      const cached = store.getState().bodies.find((b) => b.key === key)
      if (cached && cached.body.status !== 'error') {
        // Reading a kept body makes it the most recently used, so it is the last to be dropped.
        if (store.getState().bodies.at(-1) !== cached) store.setState((s) => ({ bodies: [...s.bodies.filter((b) => b.key !== key), cached] }))
        return
      }
      const started = epoch
      const put = (body: Loadable<MessageBody>): void => {
        if (!current(started)) return
        store.setState((s) => ({ bodies: [...s.bodies.filter((b) => b.key !== key), { key, body }].slice(-MAX_CACHED_BODIES) }))
      }
      put({ status: 'loading' })
      try {
        put({ status: 'ready', data: await call(() => gateway.getMessage(mailboxId, messageId)) })
      } catch (error) {
        put({ status: 'error', message: failureMessage(error) })
      }
    },

    saveDraft,

    submit,
    approve,
    cancel,
    refresh,

    async editAsNew(key) {
      const record = find(key)
      if (!record) throw new Error('That request no longer exists in this browser.')
      if (record.status === 'local_draft') return key
      if (!canCancel(record.status)) throw new Error('This request can no longer be changed.')
      await cancel(key)
      // The copy is made only once the server confirms the original is cancelled, so two versions can never both go.
      if (find(key)?.status !== 'cancelled') throw new Error(find(key)?.notice ?? 'The original could not be cancelled, so it was not copied for editing.')
      return saveDraft(null, record.content)
    },

    forget,

    watch(key) {
      // Only the first view starts the allowance; a second view of the same request must not grant a fresh one.
      if (!watchers.has(key)) attempts.set(key, 0)
      watchers.set(key, (watchers.get(key) ?? 0) + 1)
      store.setState((s) => (s.stalled.includes(key) ? { stalled: s.stalled.filter((k) => k !== key) } : s))
      schedule(key)
      return () => {
        const left = (watchers.get(key) ?? 1) - 1
        if (left > 0) return void watchers.set(key, left)
        watchers.delete(key)
        attempts.delete(key)
        stopPolling(key)
      }
    },

    onStorageEvent(key, newValue) {
      if (!ns) return
      if (key === SIGNOUT_KEY && newValue?.startsWith(`${ns}:`)) return signOut()
      if (key !== sendsKey() || store.getState().session.status !== 'ready') return
      store.setState({ sends: readRecords() })
      for (const watched of watchers.keys()) if (!timers.has(watched)) schedule(watched)
    },
  }
}
