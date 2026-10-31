import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CsrfProof, MailroomGateway, ReadContext } from '@/data/gateway'
import type { LoginInput, LogoutInput, RecoveryInput, Session } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { classifyFailure, type ActionResult } from './actionFailure'
import { RequestScope } from './scope'
import { clearSessionRecords } from '@/pwa/sessionPrivacy'

/** Freshness cadence while ready and visible; timer, focus and visibility share this schedule. */
export const SESSION_FRESHNESS_INTERVAL_MS = 30_000

/** Why the sign-in screen is shown; copy only, never identity data. */
export type SignedOutNotice =
  | { kind: 'signed_out'; upstream: 'complete' | 'pending' }
  | { kind: 'session_ended' }

export type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session }
  /** One-time automatic context recovery in flight; protected content stays hidden. */
  | { status: 'recovering' }
  /** One bounded challenge+refresh after a 401; protected content stays hidden (BE-02A). */
  | { status: 'refreshing' }
  /** Recovery allowance is spent; only explicit user retry starts a new attempt (D2). */
  | { status: 'retry_required' }
  | { status: 'unauthenticated'; notice: SignedOutNotice | null }
  /** Identity is valid but has no usable organization (404 not_available on the session). */
  | { status: 'no_organization' }
  /** Sign-out in flight; protected content is already fenced off. */
  | { status: 'signing_out' }
  /** Sign-out was not confirmed by the server; content stays hidden, the session is kept for retry. */
  | { status: 'sign_out_failed'; message: string; session: Session }
  | { status: 'error'; message: string }

/** Collision-safe identity for the keyed protected subtree; router/URL state stays outside it (D3). */
export function sessionIdentityKey(session: Session): string {
  return [session.actor.id, session.organization.id, session.context_id, session.authorization_version].join('\n')
}

export interface SessionController {
  state: SessionState
  scope: RequestScope
  /** Headers context while ready, otherwise null; it is consistency data, not authority. */
  context: ReadContext | null
  /** Explicit user retry / re-login bootstrap; replenishes the one recovery allowance. */
  refresh(): void
  /**
   * Central 401/409 policy. Returns true when the error was consumed (stale, cleared session or
   * recovery started); pages render their own state for unconsumed errors.
   */
  handleError(error: unknown, generation: number): boolean
  /** Password sign-in under a fresh challenge. Resolves after the controller settled the outcome. */
  signIn(input: LoginInput): Promise<ActionResult>
  /** Recovery request; the outcome is identical for known and unknown addresses. */
  requestRecovery(input: RecoveryInput): Promise<ActionResult>
  /** Local or global sign-out; protected content is fenced before the request is sent. */
  signOut(scope: LogoutInput['scope']): Promise<ActionResult>
  /** Explicit organization switch; a success replaces the identity and restarts reads. */
  switchOrganization(organizationId: string): Promise<ActionResult>
}

type SessionRequestKind = 'bootstrap' | 'retry' | 'recovery' | 'freshness' | 'refresh' | 'login' | 'recovery_request' | 'logout' | 'switch'
interface InFlight {
  kind: SessionRequestKind
  controller: AbortController
}

const GatewayContext = createContext<MailroomGateway | null>(null)
const SessionContext = createContext<SessionController | null>(null)

export function useGateway(): MailroomGateway {
  const gateway = useContext(GatewayContext)
  if (!gateway) throw new Error('GatewayContext missing')
  return gateway
}

export function useSession(): SessionController {
  const controller = useContext(SessionContext)
  if (!controller) throw new Error('SessionContext missing')
  return controller
}

export function SessionProvider({ gateway, children }: { gateway: MailroomGateway; children: ReactNode }) {
  const scopeRef = useRef(new RequestScope())
  const [state, setState] = useState<SessionState>({ status: 'loading' })
  // AIDEV-NOTE: Bumped when bootstrap/retry/recovery commit ready; recovery to an UNCHANGED identity
  // must still restart reads (its invalidate made them stale), and the recovering frame can batch
  // away without remounting the keyed subtree, so identity fields alone cannot signal it (D2).
  const [readEpoch, setReadEpoch] = useState(0)
  // AIDEV-NOTE: stateRef and the allowance update synchronously with each transition so duplicate
  // callbacks in the same tick cannot each dispatch work or double-spend recovery (D2).
  const stateRef = useRef<SessionState>(state)
  // AIDEV-NOTE: One recovery per allowance; only mount or explicit retry replenishes it. Automatic
  // timer/focus/visibility events, successful reads and changed identities never renew it (D2).
  const recoveryUsedRef = useRef(false)
  // AIDEV-NOTE: One challenge+refresh per 401, renewed only by a successful NON-refresh session
  // result (bootstrap, freshness, login, switch) or an explicit retry. A refresh whose next session
  // read still 401s therefore lands on sign-in instead of looping (contract README: never loop).
  const refreshUsedRef = useRef(false)
  const inFlightRef = useRef<InFlight | null>(null)
  const lastRequestStartRef = useRef(0)
  const signOutChannel = useRef<BroadcastChannel | null>(null)

  const commit = useCallback((next: SessionState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const abortInFlight = useCallback(() => {
    const inFlight = inFlightRef.current
    if (!inFlight) return
    inFlightRef.current = null
    inFlight.controller.abort()
  }, [])

  /** Claims the single in-flight slot, aborting whatever held it. */
  const claim = useCallback(
    (kind: SessionRequestKind): InFlight => {
      abortInFlight()
      const controller = new AbortController()
      const token: InFlight = { kind, controller }
      inFlightRef.current = token
      lastRequestStartRef.current = Date.now()
      return token
    },
    [abortInFlight],
  )

  /** A successful lifecycle result replaces the identity: old reads become stale and restart. */
  const commitReplacement = useCallback(
    (session: Session) => {
      scopeRef.current.invalidate()
      setReadEpoch((epoch) => epoch + 1)
      commit({ status: 'ready', session })
    },
    [commit],
  )

  const toUnauthenticated = useCallback(
    (notice: SignedOutNotice | null) => {
      scopeRef.current.invalidate()
      commit({ status: 'unauthenticated', notice })
    },
    [commit],
  )

  // AIDEV-NOTE: Sign-out fences every open window, including installed PWA windows, before network logout.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel('elevateo-session')
    signOutChannel.current = channel
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data !== 'sign-out') return
      abortInFlight()
      toUnauthenticated({ kind: 'session_ended' })
      try { clearSessionRecords() } catch { commit({ status: 'error', message: 'Local session records could not be cleared. Close all app windows and clear this site’s browser data before sharing this device.' }) }
    }
    return () => { signOutChannel.current = null; channel.close() }
  }, [abortInFlight, commit, toUnauthenticated])

  /**
   * One bounded challenge+refresh after a current 401 (contract README). Protected content is
   * hidden before the attempt; a definitive failure lands on sign-in (or no-organization), an
   * outage offers an explicit retry. Nothing here retries by itself.
   */
  const attemptRefresh = useCallback(() => {
    if (refreshUsedRef.current) {
      toUnauthenticated({ kind: 'session_ended' })
      return
    }
    refreshUsedRef.current = true
    const scope = scopeRef.current
    const token = claim('refresh')
    scope.invalidate()
    commit({ status: 'refreshing' })
    const work = async (signal: AbortSignal): Promise<Session> => {
      // The challenge proof lives only in this closure; it is never stored.
      const challenge = await gateway.getLoginChallenge(signal)
      const lifecycle = await gateway.refreshSession({ csrfToken: challenge.csrf_token }, signal)
      return lifecycle.session
    }
    work(token.controller.signal).then(
      (session) => {
        if (inFlightRef.current !== token) return
        inFlightRef.current = null
        commitReplacement(session)
      },
      (error: unknown) => {
        if (inFlightRef.current !== token) return
        inFlightRef.current = null
        scope.invalidate()
        const failure = classifyFailure(error)
        if (failure.code === 'no_organization') {
          commit({ status: 'no_organization' })
          return
        }
        if (failure.code === 'rejected' || failure.code === 'invalid') {
          toUnauthenticated({ kind: 'session_ended' })
          return
        }
        // Outage/timeout: the cookie may still be valid, so offer an explicit retry rather than
        // forcing a new password entry; the retry is a user action, not an automatic loop.
        commit({ status: 'error', message: failure.message })
      },
    )
  }, [gateway, claim, commit, commitReplacement, toUnauthenticated])

  const requestSession = useCallback(
    (kind: 'bootstrap' | 'retry' | 'recovery' | 'freshness') => {
      const scope = scopeRef.current
      if (inFlightRef.current && kind === 'freshness') return // never two concurrent session requests
      const token = claim(kind)
      if (kind !== 'freshness') {
        // Mount and explicit retry begin a bounded new attempt; a recovery already consumed its allowance.
        if (kind !== 'recovery') {
          recoveryUsedRef.current = false
          refreshUsedRef.current = false
        }
        scope.invalidate()
        commit(kind === 'recovery' ? { status: 'recovering' } : { status: 'loading' })
      }
      gateway.getSession(token.controller.signal).then(
        (session) => {
          if (inFlightRef.current !== token) return
          inFlightRef.current = null
          // A successful ordinary session result proves fresh access: the next 401 may refresh once.
          refreshUsedRef.current = false
          if (kind !== 'freshness') {
            setReadEpoch((epoch) => epoch + 1)
            commit({ status: 'ready', session })
            return
          }
          const previous = stateRef.current
          if (previous.status !== 'ready') return
          if (sessionIdentityKey(previous.session) !== sessionIdentityKey(session)) {
            // Changed identity: invalidate old reads before the replacement identity commits (D2).
            scope.invalidate()
          }
          // Unchanged identity keeps generation and read-context identity; display metadata may update.
          commit({ status: 'ready', session })
        },
        (error: unknown) => {
          if (inFlightRef.current !== token) return
          inFlightRef.current = null
          scope.invalidate()
          if (error instanceof GatewayError && error.kind === 'api') {
            if (error.code === 'unauthenticated') {
              attemptRefresh()
              return
            }
            if (error.code === 'not_available') {
              // Valid identity without a usable organization: explicit, not an empty mailbox list.
              commit({ status: 'no_organization' })
              return
            }
          }
          // Failed session validation may not leave protected data displayed (D2).
          commit({ status: 'error', message: error instanceof GatewayError ? error.message : 'The session could not be loaded.' })
        },
      )
    },
    [gateway, claim, commit, attemptRefresh],
  )

  useEffect(() => {
    requestSession('bootstrap')
    return () => abortInFlight()
  }, [requestSession, abortInFlight])

  const maybeRefresh = useCallback(() => {
    // Shared automatic eligibility (D2): ready, visible, nothing in flight, 30s since the last request.
    if (stateRef.current.status !== 'ready') return
    if (document.visibilityState !== 'visible') return
    if (inFlightRef.current !== null) return
    if (Date.now() - lastRequestStartRef.current < SESSION_FRESHNESS_INTERVAL_MS) return
    requestSession('freshness')
  }, [requestSession])

  useEffect(() => {
    if (state.status !== 'ready') return
    // Timer and listeners exist only while ready: non-ready states perform no automatic work (D2).
    // AIDEV-NOTE: The timer chains against the last request's deadline rather than a fixed interval:
    // a focus/visibility request between fixed ticks would otherwise stretch visible freshness
    // toward two intervals (request at t+31 skipping the t+60 tick until t+90). When the deadline
    // has passed but a gate (hidden/in-flight) declined, the timer backs off one full interval;
    // the next focus/visibility event still retries immediately (D2).
    let timer: ReturnType<typeof setTimeout>
    const scheduleNext = () => {
      const wait = lastRequestStartRef.current + SESSION_FRESHNESS_INTERVAL_MS - Date.now()
      timer = setTimeout(() => {
        maybeRefresh()
        scheduleNext()
      }, wait > 0 ? wait : SESSION_FRESHNESS_INTERVAL_MS)
    }
    scheduleNext()
    window.addEventListener('focus', maybeRefresh)
    document.addEventListener('visibilitychange', maybeRefresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', maybeRefresh)
      document.removeEventListener('visibilitychange', maybeRefresh)
    }
  }, [state.status, maybeRefresh])

  const refresh = useCallback(() => {
    const inFlight = inFlightRef.current
    // Coalesce repeated clicks while an explicit attempt is already in flight (D2).
    if (inFlight && (inFlight.kind === 'bootstrap' || inFlight.kind === 'retry')) return
    requestSession('retry')
  }, [requestSession])

  const handleError = useCallback(
    (error: unknown, generation: number): boolean => {
      const scope = scopeRef.current
      // Stale success or failure is ignored: it cannot clear or recover a newer context (D2).
      if (!scope.isCurrent(generation)) return true
      if (!(error instanceof GatewayError) || error.kind !== 'api') return false
      if (error.code === 'unauthenticated') {
        // Current 401 has priority over context recovery: clear and cancel immediately (D2), then
        // at most one bounded refresh before sign-in (BE-02A).
        abortInFlight()
        scope.invalidate()
        attemptRefresh()
        return true
      }
      if (error.code === 'context_changed') {
        if (recoveryUsedRef.current) {
          abortInFlight()
          scope.invalidate()
          commit({ status: 'retry_required' })
          return true
        }
        // Consume the allowance synchronously so a concurrent duplicate cannot double-spend it.
        recoveryUsedRef.current = true
        requestSession('recovery')
        return true
      }
      return false
    },
    [abortInFlight, commit, requestSession, attemptRefresh],
  )

  /** Runs one lifecycle request yielding a replacement session; failures are returned, never thrown. */
  const runEntry = useCallback(
    async (kind: 'login' | 'switch', work: (signal: AbortSignal) => Promise<Session>): Promise<ActionResult> => {
      const token = claim(kind)
      try {
        const session = await work(token.controller.signal)
        if (inFlightRef.current !== token) return { kind: 'superseded' }
        inFlightRef.current = null
        recoveryUsedRef.current = false
        refreshUsedRef.current = false
        commitReplacement(session)
        return { kind: 'ok' }
      } catch (error) {
        // AIDEV-NOTE: A superseded failure is dropped exactly like a superseded success: a late
        // error from an older attempt must not clear or describe a newer one (D2).
        if (inFlightRef.current !== token) return { kind: 'superseded' }
        inFlightRef.current = null
        const failure = classifyFailure(error)
        // AIDEV-NOTE: 404 after login = identity without any organization (explicit state). 404 on a
        // switch = that target is not available; the current organization stays and the sheet reports.
        if (failure.code === 'no_organization' && kind === 'login') {
          scopeRef.current.invalidate()
          commit({ status: 'no_organization' })
          return { kind: 'ok' }
        }
        return { kind: 'failed', failure }
      }
    },
    [claim, commit, commitReplacement],
  )

  const signIn = useCallback(
    (input: LoginInput): Promise<ActionResult> =>
      runEntry('login', async (signal) => {
        const challenge = await gateway.getLoginChallenge(signal)
        const lifecycle = await gateway.login({ csrfToken: challenge.csrf_token }, input, signal)
        return lifecycle.session
      }),
    [gateway, runEntry],
  )

  const requestRecovery = useCallback(
    async (input: RecoveryInput): Promise<ActionResult> => {
      const token = claim('recovery_request')
      try {
        const challenge = await gateway.getLoginChallenge(token.controller.signal)
        await gateway.requestRecovery({ csrfToken: challenge.csrf_token }, input, token.controller.signal)
        if (inFlightRef.current !== token) return { kind: 'superseded' }
        inFlightRef.current = null
        return { kind: 'ok' }
      } catch (error) {
        if (inFlightRef.current !== token) return { kind: 'superseded' }
        inFlightRef.current = null
        return { kind: 'failed', failure: classifyFailure(error) }
      }
    },
    [gateway, claim],
  )

  const switchOrganization = useCallback(
    async (organizationId: string): Promise<ActionResult> => {
      const current = stateRef.current
      if (current.status !== 'ready') return { kind: 'superseded' }
      const ctx: ReadContext = { contextId: current.session.context_id, authorizationVersion: current.session.authorization_version }
      const proof: CsrfProof = { csrfToken: current.session.csrf_token }
      const generation = scopeRef.current.current()
      const result = await runEntry('switch', async (signal) => {
        const lifecycle = await gateway.switchOrganization(ctx, proof, { organization_id: organizationId }, signal)
        return lifecycle.session
      })
      if (result.kind !== 'failed') return result
      // A current 401/409 on the switch is session policy, not a form error (D2/D5).
      if (result.failure.code === 'rejected' || result.failure.code === 'context_changed') {
        const original = new GatewayError('api', result.failure.code === 'rejected' ? 'unauthenticated' : 'context_changed', result.failure.message)
        if (handleError(original, generation)) return { kind: 'ok' }
      }
      return result
    },
    [gateway, runEntry, handleError],
  )

  const signOut = useCallback(
    async (scope: LogoutInput['scope']): Promise<ActionResult> => {
      const current = stateRef.current
      const session = current.status === 'ready' || current.status === 'sign_out_failed' ? current.session : null
      if (session === null && current.status !== 'no_organization') return { kind: 'superseded' }
      const token = claim('logout')
      // Fence first: nothing protected stays visible while the server answers (D2).
      scopeRef.current.invalidate()
      commit({ status: 'signing_out' })
      signOutChannel.current?.postMessage('sign-out')
      let localCleanupFailed = false
      try { clearSessionRecords() } catch { localCleanupFailed = true }
      try {
        const signal = token.controller.signal
        // A session proves with its own token; a session-less identity proves with a bound challenge.
        const proof: CsrfProof = session === null ? { csrfToken: (await gateway.getLoginChallenge(signal)).csrf_token } : { csrfToken: session.csrf_token }
        const result = await gateway.logout(proof, { scope }, signal)
        if (inFlightRef.current !== token) return { kind: 'superseded' }
        inFlightRef.current = null
        toUnauthenticated({ kind: 'signed_out', upstream: result.upstream_status })
        if (localCleanupFailed) commit({ status: 'error', message: 'Signed out, but local records could not be cleared. Clear this site’s browser data before sharing this device.' })
        return { kind: 'ok' }
      } catch (error) {
        if (inFlightRef.current !== token) return { kind: 'superseded' }
        inFlightRef.current = null
        const failure = classifyFailure(error)
        if (failure.code === 'rejected') {
          // 401: the local session is already gone (expired, or global scope without a valid one).
          toUnauthenticated({ kind: 'session_ended' })
          if (localCleanupFailed) commit({ status: 'error', message: 'Local records could not be cleared. Clear this site’s browser data before sharing this device.' })
          return { kind: 'ok' }
        }
        if (session === null) commit(localCleanupFailed ? { status: 'error', message: 'Local records could not be cleared. Clear this site’s browser data before sharing this device.' } : { status: 'no_organization' })
        else commit({ status: 'sign_out_failed', message: localCleanupFailed ? `${failure.message} Local records could not be cleared. Clear this site’s browser data before sharing this device.` : failure.message, session })
        return { kind: 'failed', failure }
      }
    },
    [gateway, claim, commit, toUnauthenticated],
  )

  const contextId = state.status === 'ready' ? state.session.context_id : null
  const authorizationVersion = state.status === 'ready' ? state.session.authorization_version : null
  // AIDEV-NOTE: Context object identity is keyed to the identity fields plus readEpoch: an unchanged
  // freshness response preserves in-flight reads and accumulated pages, while a bootstrap/retry/
  // recovery success replaces the object so consumers restart their invalidated reads (D2/D3).
  const context = useMemo<ReadContext | null>(
    () => (contextId !== null && authorizationVersion !== null ? { contextId, authorizationVersion } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readEpoch deliberately renews identity
    [contextId, authorizationVersion, readEpoch],
  )

  const controller = useMemo<SessionController>(
    () => ({ state, scope: scopeRef.current, context, refresh, handleError, signIn, requestRecovery, signOut, switchOrganization }),
    [state, context, refresh, handleError, signIn, requestRecovery, signOut, switchOrganization],
  )

  return (
    <GatewayContext.Provider value={gateway}>
      <SessionContext.Provider value={controller}>{children}</SessionContext.Provider>
    </GatewayContext.Provider>
  )
}
