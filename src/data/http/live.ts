import { z } from 'zod'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { canApprove, canCancel, canStartSubmission, checkSendContent, nextPollDelay, pendingKeySchema, type PendingKey, type SendContent, type SendStatus } from '@/domain/sendLifecycle'
import { isServerId, type Capabilities, type MailboxPermissions, type MailboxQuota, type MessageBody, type MessageCursor, type MessageSummary, type SavedSend, type SendCursor, type SendSummary, type ServerMailbox } from './contract'
import { ApiFailure } from './httpClient'
import type { FixtureSignIn, FixtureUser, ServerGateway } from './ports'

// AIDEV-NOTE: The single owner of API-backed state. Components read this store and call these actions; the HTTP
// adapter returns DTOs and writes nothing. No other module may call setState on it. There is no mock fallback:
// when the server cannot be reached the state says so.
// AIDEV-NOTE: The server owns send requests: history, content and state are read from it and held in bounded memory.
// Browser storage keeps only idempotency keys of submissions whose answer has not arrived (no recipients, no text).
// Nothing unresolved is ever dropped to respect a limit: at the limit, new submissions are refused instead.

export const PAGE_LIMIT = 50
export const REQUEST_PAGE_LIMIT = 25
const MAX_CACHED_BODIES = 20
const MAX_CACHED_REQUESTS = 20
/** Looking for one idempotency key reads at most this many list pages; beyond that the search is left unfinished. */
const MAX_SCAN_PAGES = 10
const MAX_LEGACY_CHECKS = 200
const PENDING_PREFIX = 'elevateo:pending:'
/** Written when the signed-in account changes, so other tabs re-check who they are. Holds an opaque id, no secret. */
const ACCOUNT_KEY = 'elevateo:account'
/** Written after a change to a send request, so other tabs read the server again. Holds a time, nothing else. */
const SYNC_KEY = 'elevateo:sync'
// Left by the version that kept a pasted token and full send records in the browser.
const LEGACY_TOKEN_KEY = 'elevateo:session'
const LEGACY_SENDS_PREFIX = 'elevateo:sends:'
const LEGACY_SIGNOUT_KEY = 'elevateo:signed-out'

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

/** One page of the server's send-request history. Only this page is held; the cursor lives in the URL. */
export interface RequestList {
  cursor: SendCursor | null
  page: Loadable<{ items: SendSummary[]; next: SendCursor | null }>
}

/** An opened request: its saved content (memory only) and the latest state read from the server. */
export interface RequestDetail {
  id: string
  saved: Loadable<SavedSend>
  status: SendStatus | null
  revision: string | null
  successorId: string | null
  errorCode: string | null
  /** Server diagnostic id for a rejected or unknown outcome; quoted to an operator, never shown as proof of delivery. */
  correlationId: string | null
  checkedAt: string | null
  /** Last refusal or failure the person should see, in plain words. Cleared by the next successful step. */
  notice: string | null
}

export interface PendingSubmission extends PendingKey {
  /** `missing`: the server's list was read and does not contain it, so it was never saved. */
  state: 'waiting' | 'checking' | 'missing'
  notice: string | null
}

/** A record left by the earlier version that the server does not hold for this account. Only what is safe to show. */
export interface LegacyRecord {
  key: string
  status: string
  createdAt: string | null
}

export interface LiveState {
  session: SessionState
  accountId: string | null
  capabilities: Capabilities | null
  mailboxes: ServerMailbox[]
  quotas: Record<string, Loadable<MailboxQuota>>
  list: MessageList | null
  /** Recently opened bodies, newest last, keyed `mailboxId/messageId`. Bounded so a long session cannot grow it. */
  bodies: Array<{ key: string; body: Loadable<MessageBody> }>
  requests: RequestList | null
  /** Recently opened requests, most recently used last. Bounded; anything dropped is read from the server again. */
  details: RequestDetail[]
  pending: PendingSubmission[]
  legacy: LegacyRecord[]
  /** Ids whose automatic checking stopped at its limit while still queued or sending. */
  stalled: string[]
}

const EMPTY: Omit<LiveState, 'session'> = { accountId: null, capabilities: null, mailboxes: [], quotas: {}, list: null, bodies: [], requests: null, details: [], pending: [], legacy: [], stalled: [] }

export interface LiveDeps {
  gateway: ServerGateway
  /** Present only in the Docker fixture build. Production has no sign-in route yet. */
  fixture: FixtureSignIn | null
  /** Tab storage. Nothing is written to it; it is only cleared of the token an earlier version kept. */
  session: Pick<Storage, 'removeItem'>
  /** Shared by tabs of the same browser. Holds idempotency keys and change markers only. */
  local: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>
  now(): number
  newKey(): string
}

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : 'Something went wrong. Nothing was changed.')
const isUnauthorized = (error: unknown): boolean => error instanceof ApiFailure && error.kind === 'unauthorized'
const legacyRecordSchema = z.object({ key: z.string(), status: z.string(), intentId: z.string().nullable().optional(), createdAt: z.string().optional(), content: z.unknown().optional() })
const legacyContentSchema = z.object({ to: z.array(z.string()), cc: z.array(z.string()), bcc: z.array(z.string()), subject: z.string(), body: z.string() })
const addressSet = (list: string[]): string => [...new Set(list.map((a) => a.trim().toLowerCase()))].sort().join(',')
/** True only when the server's saved content says what the browser's old copy says. Anything unreadable is not a match. */
function sameContent(legacy: unknown, saved: SavedSend): boolean {
  const parsed = legacyContentSchema.safeParse(legacy)
  if (!parsed.success) return false
  const old = parsed.data
  return old.body === saved.body && old.subject.trim() === saved.subject && addressSet(old.to) === addressSet(saved.to) && addressSet(old.cc) === addressSet(saved.cc) && addressSet(old.bcc) === addressSet(saved.bcc)
}

export interface ReplaceTarget {
  id: string
  revision: string
}
export type SubmitResult =
  /** `converged`: another tab had already replaced the request; this is that single successor, not a second one. */
  | { outcome: 'saved'; id: string; converged: boolean }
  | { outcome: 'unconfirmed'; key: string }
  | { outcome: 'refused'; message: string }

export interface Live {
  store: StoreApi<LiveState>
  readonly canFixtureSignIn: boolean
  /** Asks the server who the browser's session belongs to. Call once at start. */
  start(): Promise<void>
  fixtureSignIn(user: FixtureUser): Promise<void>
  /** Ends the session on the server. Throws, and stays signed in, if the server could not be told. */
  signOut(): Promise<void>
  retry(): Promise<void>
  /** Re-reads the session: another tab may have signed out or signed in as someone else. */
  recheckSession(): Promise<void>
  refreshMailboxes(): Promise<void>
  loadQuota(mailboxId: string): Promise<void>
  setPermissions(mailboxId: string, permissions: MailboxPermissions): Promise<void>
  /** Loads one page: the newest, or the one a server-issued cursor points at. */
  openList(mailboxId: string, cursor?: MessageCursor | null): Promise<void>
  reloadPage(): Promise<void>
  openBody(mailboxId: string, messageId: string): Promise<void>
  openRequests(cursor?: SendCursor | null): Promise<void>
  reloadRequests(): Promise<void>
  /** Reads a request's saved content and current state from the server. */
  openRequest(id: string): Promise<void>
  /**
   * Saves a new request, or atomically replaces `replaces` with one successor. Sends nothing: the saved request
   * still needs approval. The idempotency key is stored before the request is made.
   */
  submit(content: SendContent, replaces?: ReplaceTarget | null): Promise<SubmitResult>
  /** Finds out what became of a submission with no answer. Returns the saved request's id, or null. */
  resolvePending(key: string): Promise<string | null>
  /** Forgets a submission the server is known not to hold. */
  dismissPending(key: string): void
  approve(id: string): Promise<void>
  cancel(id: string): Promise<void>
  refresh(id: string): Promise<void>
  /** Starts bounded status checks while a view is open. The returned function stops them. */
  watch(id: string): () => void
  /** Removes records left by the earlier version. Only ever called by an explicit choice of the person. */
  discardLegacy(): void
  /** Call for every `storage` event: another tab changed a request, the account, or a pending submission. */
  onStorageEvent(key: string | null): void
}

export function createLive(deps: LiveDeps): Live {
  // Starts as loading: until start() has asked the server, nobody is known to be signed out.
  const store = createStore<LiveState>(() => ({ session: { status: 'loading' }, ...EMPTY }))
  const { gateway } = deps
  // Bumped whenever the account changes. A response that started under an older epoch belongs to someone else's
  // session and is dropped instead of being written.
  let epoch = 0
  const current = (started: number): boolean => started === epoch
  const nowIso = (): string => new Date(deps.now()).toISOString()
  // Content of submissions made in this tab, by idempotency key. Memory only: it lets a lost answer be retried with
  // identical content, and is gone on reload, after which the key alone finds the saved request in the server list.
  const inflight = new Map<string, { content: SendContent; replaces: ReplaceTarget | null }>()
  // Where a search for a key stopped at its page limit, so the next check continues instead of starting over.
  const scanFrom = new Map<string, SendCursor>()
  // A value no two changes share: writing the same value twice would not raise a storage event in other tabs.
  const changeMarker = (): string => `${deps.now()}:${deps.newKey()}`

  // ---- session ---------------------------------------------------------------------------------------------
  function dropAccountData(session: SessionState): void {
    epoch++
    stopAllPolling()
    inflight.clear()
    scanFrom.clear()
    stateReads.clear()
    store.setState({ session, ...EMPTY })
  }
  /** Any 401 ends the session everywhere in this tab: cached account data must not outlive it. */
  function guard(error: unknown): never {
    if (isUnauthorized(error) && store.getState().session.status !== 'signed_out') {
      const had = store.getState().accountId !== null
      dropAccountData(had ? { status: 'expired' } : { status: 'signed_out' })
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
  function mark(key: string, value: string): void {
    try {
      deps.local.setItem(key, value)
    } catch {
      // Other tabs cannot be told; each still reads the server itself when it is next used.
    }
  }

  async function bootstrap(attempt = 0): Promise<void> {
    const started = epoch
    store.setState({ session: { status: 'loading' } })
    try {
      const me = await call(() => gateway.me())
      const [capabilities, mailboxes] = await call(() => Promise.all([gateway.capabilities(), gateway.listMailboxes()]))
      // Another tab may have replaced the cookie between those answers. The account is asked for again, and what
      // was loaded is kept only if it is still the same one: one account's id never sits beside another's data.
      const confirmed = await call(() => gateway.me())
      if (!current(started)) return
      if (confirmed.accountId !== me.accountId) {
        if (attempt < 2) return await bootstrap(attempt + 1)
        throw new ApiFailure('unavailable', 'The signed-in account kept changing while it was being loaded. Try again.')
      }
      store.setState({ session: { status: 'ready' }, accountId: me.accountId, capabilities, mailboxes, pending: readPending(me.accountId).map((p) => ({ ...p, state: 'waiting', notice: null })) })
      // The cookie is shared by every tab. If it now belongs to a different account than the last page saw, the
      // other tabs are told to ask again, so none keeps showing the previous account.
      if (!deps.local.getItem(ACCOUNT_KEY)?.startsWith(`${me.accountId}:`)) mark(ACCOUNT_KEY, `${me.accountId}:${changeMarker()}`)
      void recoverPending(started).then(() => reconcileLegacy(started))
    } catch (error) {
      if (!current(started) || isUnauthorized(error)) return
      store.setState({ session: { status: 'unavailable', message: failureMessage(error) } })
    }
  }

  async function recheckSession(): Promise<void> {
    const before = store.getState()
    if (before.session.status === 'loading') return
    const started = epoch
    try {
      const me = await gateway.me()
      if (!current(started) || me.accountId === before.accountId) return
      // A different account (or the first one) now owns the session cookie: nothing of the previous one may remain.
      dropAccountData({ status: 'loading' })
      await bootstrap()
    } catch (error) {
      if (!current(started) || !isUnauthorized(error) || before.accountId === null) return
      dropAccountData({ status: 'expired' })
    }
  }

  // ---- pending submissions (idempotency keys only) -----------------------------------------------------------
  // AIDEV-NOTE: One storage entry per submission (`elevateo:pending:<account>:<key>`). Tabs only ever add or remove
  // their own entry, so there is no shared list for two tabs to overwrite each other's changes in.
  const pendingPrefix = (accountId: string): string => `${PENDING_PREFIX}${accountId}:`
  function readPending(accountId: string): PendingKey[] {
    const prefix = pendingPrefix(accountId)
    const found: PendingKey[] = []
    for (let i = 0; i < deps.local.length; i++) {
      const storageKey = deps.local.key(i)
      if (!storageKey?.startsWith(prefix)) continue
      try {
        const parsed = pendingKeySchema.safeParse({ ...(JSON.parse(deps.local.getItem(storageKey) ?? 'null') as object), key: storageKey.slice(prefix.length) })
        if (parsed.success) found.push(parsed.data)
      } catch {
        // An entry that cannot be read is left where it is; it is never deleted to make room.
      }
    }
    return found.sort((x, y) => x.startedAt - y.startedAt)
  }
  /** Brings in submissions other tabs started or resolved. States already known here are kept. */
  function syncPending(): PendingSubmission[] {
    const accountId = store.getState().accountId
    if (!accountId) return []
    const known = new Map(store.getState().pending.map((entry) => [entry.key, entry]))
    const pending = readPending(accountId).map((entry): PendingSubmission => known.get(entry.key) ?? { ...entry, state: 'waiting', notice: null })
    store.setState({ pending })
    return pending
  }
  /** Returns false when the browser refused to store the key. */
  function addPending(entry: PendingKey): boolean {
    const accountId = store.getState().accountId
    if (!accountId) return false
    try {
      deps.local.setItem(`${pendingPrefix(accountId)}${entry.key}`, JSON.stringify({ startedAt: entry.startedAt, replaces: entry.replaces }))
    } catch {
      return false
    }
    store.setState((state) => ({ pending: [...state.pending, { ...entry, state: 'waiting', notice: null }] }))
    return true
  }
  const patchPending = (key: string, change: Partial<PendingSubmission>): void => store.setState((s) => ({ pending: s.pending.map((p) => (p.key === key ? { ...p, ...change } : p)) }))
  function settle(key: string): void {
    inflight.delete(key)
    const accountId = store.getState().accountId
    if (accountId) deps.local.removeItem(`${pendingPrefix(accountId)}${key}`)
    store.setState((state) => ({ pending: state.pending.filter((p) => p.key !== key) }))
  }

  /** Looks for a request by its idempotency key in the server's list, newest first, within fixed bounds. */
  async function findByKey(key: string): Promise<SendSummary | 'absent' | 'unfinished'> {
    const resumed = scanFrom.get(key) ?? null
    let cursor: SendCursor | null = resumed
    const match = (items: SendSummary[]): SendSummary | undefined => items.find((item) => item.idempotencyKey === key)
    for (let page = 0; page < MAX_SCAN_PAGES; page++) {
      const result = await call(() => gateway.listSendRequests(cursor, PAGE_LIMIT))
      const found = match(result.items)
      if (found) {
        scanFrom.delete(key)
        return found
      }
      // Only the end of the list proves absence. Times are not compared: this browser's clock is not the server's.
      if (!result.next) {
        scanFrom.delete(key)
        // A search that continued from an earlier stop skipped the newest page; it is read once before saying no.
        const late = resumed ? match((await call(() => gateway.listSendRequests(null, PAGE_LIMIT))).items) : undefined
        return late ?? 'absent'
      }
      cursor = result.next
    }
    if (cursor) scanFrom.set(key, cursor)
    return 'unfinished'
  }

  async function attempt(key: string): Promise<SubmitResult> {
    const job = inflight.get(key)
    if (!job) return { outcome: 'unconfirmed', key }
    const started = epoch
    const superseded: SubmitResult = { outcome: 'refused', message: 'The signed-in account changed, so nothing more was done.' }
    try {
      const saved = job.replaces ? await call(() => gateway.replaceSendRequest(job.replaces!.id, job.replaces!.revision, key, job.content)) : await call(() => gateway.createSendRequest(key, job.content))
      if (!current(started)) return superseded
      settle(key)
      if (job.replaces) {
        beginRead(job.replaces.id)
        patchDetail(job.replaces.id, { status: 'cancelled', successorId: saved.id, notice: null })
      }
      changed()
      return { outcome: 'saved', id: saved.id, converged: false }
    } catch (error) {
      if (!current(started)) return superseded
      const failure = error instanceof ApiFailure ? error : null
      if (failure?.code === 'replacement_conflict' && job.replaces) {
        // Another tab or device already replaced it. There is one successor; show that one instead of a second.
        const predecessor = await call(() => gateway.getSendContent(job.replaces!.id)).catch(() => null)
        if (!current(started)) return superseded
        if (!predecessor) {
          // The key is kept until the one successor has actually been read; checking again repeats this step.
          patchPending(key, { state: 'waiting', notice: 'This request was already replaced elsewhere, but the replacement could not be read yet. Check again.' })
          return { outcome: 'unconfirmed', key }
        }
        settle(key)
        const successorId = predecessor.summary.successorId
        if (successorId) {
          patchDetail(job.replaces.id, { status: predecessor.summary.status, successorId })
          return { outcome: 'saved', id: successorId, converged: true }
        }
        return { outcome: 'refused', message: failureMessage(error) }
      }
      // A coded refusal means nothing was saved. Anything else leaves the outcome open, to be looked up by key.
      if (failure?.kind === 'refused' && !failure.outcomeUncertain && failure.code !== 'idempotency_conflict') {
        settle(key)
        return { outcome: 'refused', message: failureMessage(error) }
      }
      patchPending(key, { state: 'waiting', notice: `${failureMessage(error)} It is not known whether the server saved this request.` })
      return { outcome: 'unconfirmed', key }
    }
  }

  async function submit(content: SendContent, replaces: ReplaceTarget | null = null): Promise<SubmitResult> {
    const check = checkSendContent(content)
    if (!check.ok) return { outcome: 'refused', message: check.errors[0]?.message ?? 'The message is not ready.' }
    const pending = syncPending()
    if (!canStartSubmission(pending)) return { outcome: 'refused', message: `${pending.length} earlier submissions are still unconfirmed. Resolve them on the Send requests page first. Nothing was sent to the server.` }
    const key = deps.newKey()
    // The key is stored BEFORE the request leaves. Without it a lost answer could not be traced after a reload,
    // so when the browser refuses to store it nothing is sent at all.
    if (!addPending({ key, startedAt: deps.now(), replaces: replaces?.id ?? null })) {
      return { outcome: 'refused', message: 'This browser could not store the reference needed to recover the request if its answer were lost. Nothing was sent to the server. Free some browser storage and try again.' }
    }
    inflight.set(key, { content: check.content, replaces })
    return attempt(key)
  }

  async function resolvePending(key: string): Promise<string | null> {
    const entry = store.getState().pending.find((p) => p.key === key)
    if (!entry || entry.state === 'checking') return null
    patchPending(key, { state: 'checking', notice: null })
    // Same tab, content still in memory: the identical request is repeated under the same key.
    if (inflight.has(key)) {
      const result = await attempt(key)
      return result.outcome === 'saved' ? result.id : null
    }
    const started = epoch
    try {
      const found = await findByKey(key)
      if (!current(started)) return null
      if (found === 'unfinished') {
        patchPending(key, { state: 'waiting', notice: 'The server holds many newer requests, so the search is not finished. Check again to continue from where it stopped.' })
        return null
      }
      if (found === 'absent') {
        patchPending(key, { state: 'missing', notice: null })
        return null
      }
      settle(key)
      changed()
      return found.id
    } catch (error) {
      if (current(started)) patchPending(key, { state: 'waiting', notice: `It could not be checked: ${failureMessage(error)}` })
      return null
    }
  }

  async function recoverPending(started: number): Promise<void> {
    for (const entry of store.getState().pending) {
      if (!current(started)) return
      await resolvePending(entry.key)
    }
  }

  // ---- records left by the earlier version -------------------------------------------------------------------
  function legacyKeys(): string[] {
    const keys: string[] = []
    for (let i = 0; i < deps.local.length; i++) {
      const key = deps.local.key(i)
      if (key?.startsWith(LEGACY_SENDS_PREFIX)) keys.push(key)
    }
    return keys
  }
  /**
   * The earlier version kept whole send records in the browser. Each one the server holds for this account is
   * recovered there and its browser copy removed. The rest are NOT deleted: they are counted for the person to
   * decide, without showing their text, because the browser cannot tell whose account they belonged to.
   */
  async function reconcileLegacy(started: number): Promise<void> {
    deps.local.removeItem(LEGACY_SIGNOUT_KEY)
    const kept: LegacyRecord[] = []
    let checks = 0
    for (const storageKey of legacyKeys()) {
      let records: unknown[]
      try {
        const raw: unknown = JSON.parse(deps.local.getItem(storageKey) ?? '[]')
        if (!Array.isArray(raw)) throw new Error('not a list')
        records = raw
      } catch {
        kept.push({ key: storageKey, status: 'unreadable', createdAt: null })
        continue
      }
      const remaining: unknown[] = []
      for (const raw of records) {
        const parsed = legacyRecordSchema.safeParse(raw)
        const held = parsed.success && checks++ < MAX_LEGACY_CHECKS ? await serverHolds(parsed.data).catch(() => false) : false
        if (!current(started)) return
        if (held) continue
        remaining.push(raw)
        kept.push(parsed.success ? { key: parsed.data.key, status: parsed.data.status, createdAt: parsed.data.createdAt ?? null } : { key: storageKey, status: 'unreadable', createdAt: null })
      }
      if (remaining.length === records.length) continue
      if (remaining.length === 0) deps.local.removeItem(storageKey)
      else mark(storageKey, JSON.stringify(remaining))
    }
    store.setState({ legacy: kept })
  }
  async function serverHolds(record: z.infer<typeof legacyRecordSchema>): Promise<boolean> {
    let id = record.intentId && isServerId(record.intentId) ? record.intentId : null
    if (!id) {
      if (record.status !== 'unconfirmed' || !isServerId(record.key)) return false
      const found = await findByKey(record.key)
      if (found === 'absent' || found === 'unfinished') return false
      id = found.id
    }
    // That a request with this id exists proves nothing about this record. The browser copy is given up only when
    // the server returns saved content under the same key that says the same thing.
    const saved = await call(() => gateway.getSendContent(id))
    return saved.summary.idempotencyKey === record.key && sameContent(record.content, saved)
  }

  // ---- send requests -----------------------------------------------------------------------------------------
  const findDetail = (id: string): RequestDetail | undefined => store.getState().details.find((d) => d.id === id)
  // Reads of one request can overlap (opening it, a status check, another tab's change). Only the answer to the
  // most recent read, or a later action, may set its state: an older answer arriving late is dropped.
  const stateReads = new Map<string, number>()
  let readCount = 0
  function beginRead(id: string): number {
    // Numbers are never reused, so forgetting old entries cannot make a stale answer look current.
    if (stateReads.size > 200 && !stateReads.has(id)) stateReads.clear()
    const read = ++readCount
    stateReads.set(id, read)
    return read
  }
  const latestRead = (id: string, read: number): boolean => stateReads.get(id) === read
  const blankDetail = (id: string): RequestDetail => ({ id, saved: { status: 'idle' }, status: null, revision: null, successorId: null, errorCode: null, correlationId: null, checkedAt: null, notice: null })
  /** Creates or updates an opened request and makes it the most recently used. */
  function putDetail(id: string, change: Partial<RequestDetail>): void {
    store.setState((s) => ({ details: [...s.details.filter((d) => d.id !== id), { ...(s.details.find((d) => d.id === id) ?? blankDetail(id)), ...change }].slice(-MAX_CACHED_REQUESTS) }))
    if (watchers.get(id) && !timers.has(id)) schedule(id)
  }
  /** Updates an opened request only if it is still held; the list row, if on screen, follows the same state. */
  function patchDetail(id: string, change: Partial<RequestDetail>): void {
    if (findDetail(id)) putDetail(id, change)
    const status = change.status
    if (!status) return
    store.setState((s) => {
      if (s.requests?.page.status !== 'ready') return s
      const { items, next } = s.requests.page.data
      return { requests: { ...s.requests, page: { status: 'ready', data: { next, items: items.map((item) => (item.id === id ? { ...item, status, successorId: change.successorId ?? item.successorId } : item)) } } } }
    })
  }
  /** A request changed here: this tab's list is read again and other tabs are told to read theirs. */
  function changed(): void {
    mark(SYNC_KEY, changeMarker())
    void reloadRequests()
  }
  const mailboxOf = (id: string): string | null => {
    const saved = findDetail(id)?.saved
    return saved?.status === 'ready' ? saved.data.summary.mailboxId : null
  }
  /** Capacity moves when a request is held, released or accepted, so a figure already on screen is read again. */
  function rereadQuota(id: string): void {
    const mailboxId = mailboxOf(id)
    if (mailboxId && store.getState().quotas[mailboxId]) void loadQuota(mailboxId)
  }

  async function inspect(id: string): Promise<void> {
    const started = epoch
    const read = beginRead(id)
    const intent = await call(() => gateway.getSendRequest(id))
    if (!current(started) || !latestRead(id, read)) return
    const before = findDetail(id)?.status
    patchDetail(id, { status: intent.status, revision: intent.revision, errorCode: intent.errorCode, correlationId: intent.correlationId, checkedAt: nowIso() })
    if (before !== intent.status) rereadQuota(id)
  }

  async function openRequest(id: string): Promise<void> {
    const held = findDetail(id)
    if (held?.saved.status === 'loading') return
    const started = epoch
    putDetail(id, held?.saved.status === 'ready' ? {} : { saved: { status: 'loading' } })
    const read = beginRead(id)
    try {
      const saved = await call(() => gateway.getSendContent(id))
      if (!current(started)) return
      const { summary } = saved
      // The content is immutable and always kept; the state that came with it only if nothing newer was read since.
      if (!latestRead(id, read)) return putDetail(id, { saved: { status: 'ready', data: saved } })
      putDetail(id, { saved: { status: 'ready', data: saved }, status: summary.status, revision: summary.revision, successorId: summary.successorId, checkedAt: nowIso() })
      // Only these two states carry a reason and a reference worth a second read.
      if (summary.status === 'rejected' || summary.status === 'unknown') await inspect(id).catch(() => undefined)
    } catch (error) {
      if (current(started)) putDetail(id, { saved: { status: 'error', message: failureMessage(error) } })
    }
  }

  async function approve(id: string): Promise<void> {
    const detail = findDetail(id)
    if (!detail?.revision || !detail.status || !canApprove(detail.status)) return
    const started = epoch
    try {
      await call(() => gateway.approveSendRequest(id, detail.revision!))
      if (!current(started)) return
      beginRead(id)
      patchDetail(id, { status: 'pending', notice: null })
      rereadQuota(id)
      mark(SYNC_KEY, changeMarker())
      // A pause on the server decides whether "queued" will move; read it again rather than trust the sign-in value.
      void call(() => gateway.capabilities()).then(
        (capabilities) => current(started) && store.setState({ capabilities }),
        () => undefined,
      )
      await inspect(id).catch(() => undefined)
    } catch (error) {
      if (!current(started)) return
      const failure = error instanceof ApiFailure ? error : null
      // Approval is not repeatable. Whatever went wrong, the saved state is read back rather than approving again.
      const inspected = await inspect(id).then(
        () => true,
        () => false,
      )
      if (!current(started)) return
      const now = findDetail(id)
      if (inspected && now && now.status !== 'draft') return patchDetail(id, { notice: null })
      patchDetail(id, { notice: failure?.kind === 'refused' && inspected ? failureMessage(error) : `${failureMessage(error)} It is not known whether the approval was recorded. Check its status before doing anything else.` })
    }
  }

  async function cancel(id: string): Promise<void> {
    const detail = findDetail(id)
    if (!detail?.status || !canCancel(detail.status)) return
    const started = epoch
    try {
      await call(() => gateway.cancelSendRequest(id))
      if (!current(started)) return
      beginRead(id)
      patchDetail(id, { status: 'cancelled', notice: null })
      rereadQuota(id)
      mark(SYNC_KEY, changeMarker())
      await inspect(id).catch(() => undefined)
    } catch (error) {
      if (!current(started)) return
      await inspect(id).catch(() => undefined)
      if (!current(started)) return
      if (findDetail(id)?.status !== 'cancelled') patchDetail(id, { notice: failureMessage(error) })
    }
  }

  async function refresh(id: string): Promise<void> {
    if (!findDetail(id)) return
    const started = epoch
    try {
      await inspect(id)
      if (current(started) && findDetail(id)?.notice?.includes('not known')) patchDetail(id, { notice: null })
    } catch (error) {
      if (current(started)) patchDetail(id, { notice: `Status could not be checked: ${failureMessage(error)}` })
      throw error
    }
  }

  // Only the most recent read of a list may write its answer: an older one arriving late would show a stale page.
  let requestsRead = 0
  async function loadRequests(cursor: SendCursor | null): Promise<void> {
    const started = epoch
    const read = ++requestsRead
    const previous = store.getState().requests
    // Re-reading the page already on screen keeps it visible meanwhile; a different page shows a loading state.
    const samePage = previous?.page.status === 'ready' && previous.cursor?.beforeId === cursor?.beforeId && previous.cursor?.before === cursor?.before
    if (!samePage) store.setState({ requests: { cursor, page: { status: 'loading' } } })
    const mine = (): boolean => current(started) && read === requestsRead
    try {
      const data = await call(() => gateway.listSendRequests(cursor, REQUEST_PAGE_LIMIT))
      if (mine()) store.setState({ requests: { cursor, page: { status: 'ready', data } } })
    } catch (error) {
      if (mine()) store.setState({ requests: { cursor, page: { status: 'error', message: failureMessage(error) } } })
    }
  }
  async function reloadRequests(): Promise<void> {
    const requests = store.getState().requests
    if (requests) await loadRequests(requests.cursor)
  }

  // ---- polling ---------------------------------------------------------------------------------------------
  const watchers = new Map<string, number>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const attempts = new Map<string, number>()
  function stopPolling(id: string): void {
    const timer = timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(id)
  }
  function stopAllPolling(): void {
    for (const id of [...timers.keys()]) stopPolling(id)
    watchers.clear()
    attempts.clear()
  }
  function schedule(id: string): void {
    stopPolling(id)
    const status = findDetail(id)?.status
    if (!status || !watchers.get(id)) return
    const attempt = attempts.get(id) ?? 0
    const delay = nextPollDelay(status, attempt)
    const stalled = store.getState().stalled
    if (delay === null) {
      // Still queued or sending after the last allowed check: say so, and leave further checks to the person.
      const waiting = status === 'pending' || status === 'dispatching'
      if (waiting !== stalled.includes(id)) store.setState({ stalled: waiting ? [...stalled, id] : stalled.filter((k) => k !== id) })
      return
    }
    timers.set(
      id,
      setTimeout(() => {
        // The status may have changed while this timer was waiting (a manual check, another tab). If it no longer
        // calls for automatic checks, such as an unknown outcome, none is made.
        const latest = findDetail(id)?.status
        if (!latest || nextPollDelay(latest, attempt) === null) return schedule(id)
        attempts.set(id, attempt + 1)
        void refresh(id)
          .catch(() => undefined)
          .then(() => schedule(id))
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
    canFixtureSignIn: deps.fixture !== null,

    async start() {
      // The earlier version kept a pasted session token readable by script in this tab. It is never used again.
      deps.session.removeItem(LEGACY_TOKEN_KEY)
      await bootstrap()
    },

    async fixtureSignIn(user) {
      if (!deps.fixture) return
      dropAccountData({ status: 'loading' })
      const started = epoch
      // Told before the cookie changes, so other tabs stop showing their account now rather than after the fact.
      mark(ACCOUNT_KEY, `changing:${changeMarker()}`)
      try {
        await deps.fixture.provision(user)
      } catch (error) {
        if (current(started)) store.setState({ session: { status: 'signed_out', reason: `The fixture session could not be started: ${failureMessage(error)}` } })
        return
      }
      if (!current(started)) return
      await bootstrap()
    },

    async signOut() {
      try {
        await gateway.logout()
      } catch (error) {
        // Already signed out on the server is the wanted result. Anything else means the session may still be live.
        if (!isUnauthorized(error)) throw error
      }
      dropAccountData({ status: 'signed_out' })
      mark(ACCOUNT_KEY, `none:${changeMarker()}`)
    },

    retry: () => bootstrap(),
    recheckSession,

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

    openRequests: (cursor = null) => loadRequests(cursor),
    reloadRequests,
    openRequest,
    submit,
    resolvePending,

    dismissPending(key) {
      if (store.getState().pending.find((p) => p.key === key)?.state === 'missing') settle(key)
    },

    approve,
    cancel,
    refresh,

    watch(id) {
      // Only the first view starts the allowance; a second view of the same request must not grant a fresh one.
      if (!watchers.has(id)) attempts.set(id, 0)
      watchers.set(id, (watchers.get(id) ?? 0) + 1)
      store.setState((s) => (s.stalled.includes(id) ? { stalled: s.stalled.filter((k) => k !== id) } : s))
      schedule(id)
      return () => {
        const left = (watchers.get(id) ?? 1) - 1
        if (left > 0) return void watchers.set(id, left)
        watchers.delete(id)
        attempts.delete(id)
        stopPolling(id)
      }
    },

    discardLegacy() {
      legacyKeys().forEach((key) => deps.local.removeItem(key))
      store.setState({ legacy: [] })
    },

    onStorageEvent(key) {
      if (key === ACCOUNT_KEY) {
        const marker = deps.local.getItem(ACCOUNT_KEY) ?? ''
        const held = store.getState().accountId
        if (held && marker.startsWith(`${held}:`)) return
        if (marker.startsWith('none:')) return void (held && dropAccountData({ status: 'expired' }))
        // The cookie is changing hands or already belongs to someone else. What this tab holds is dropped at once,
        // before the server is asked, so no answer still on its way can be shown under the wrong account.
        dropAccountData({ status: 'loading' })
        return void bootstrap()
      }
      const { accountId, session } = store.getState()
      if (!accountId || session.status !== 'ready') return
      if (key?.startsWith(pendingPrefix(accountId))) return void syncPending()
      if (key !== SYNC_KEY) return
      // Another tab changed a request. The server is the authority, so it is read again rather than copied across.
      void reloadRequests()
      for (const id of watchers.keys()) void refresh(id).catch(() => undefined)
    },
  }
}
