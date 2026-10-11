import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { MailroomGateway, ReadContext } from '@/data/gateway'
import type { Session } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { RequestScope } from './scope'

/** Freshness cadence while ready and visible; timer, focus and visibility share this schedule. */
export const SESSION_FRESHNESS_INTERVAL_MS = 30_000

export type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session }
  /** One-time automatic context recovery in flight; protected content stays hidden. */
  | { status: 'recovering' }
  /** Recovery allowance is spent; only explicit user retry starts a new attempt (D2). */
  | { status: 'retry_required' }
  | { status: 'unauthenticated' }
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
}

type SessionRequestKind = 'bootstrap' | 'retry' | 'recovery' | 'freshness'
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
  // AIDEV-NOTE: stateRef and the allowance update synchronously with each transition so duplicate
  // callbacks in the same tick cannot each dispatch work or double-spend recovery (D2).
  const stateRef = useRef<SessionState>(state)
  // AIDEV-NOTE: One recovery per allowance; only mount or explicit retry replenishes it. Automatic
  // timer/focus/visibility events, successful reads and changed identities never renew it (D2).
  const recoveryUsedRef = useRef(false)
  const inFlightRef = useRef<InFlight | null>(null)
  const lastRequestStartRef = useRef(0)

  const commit = useCallback((next: SessionState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const requestSession = useCallback(
    (kind: SessionRequestKind) => {
      const scope = scopeRef.current
      if (inFlightRef.current) {
        if (kind === 'freshness') return // never two concurrent session requests
        const superseded = inFlightRef.current
        inFlightRef.current = null
        superseded.controller.abort()
      }
      const controller = new AbortController()
      const token: InFlight = { kind, controller }
      inFlightRef.current = token
      lastRequestStartRef.current = Date.now()
      if (kind !== 'freshness') {
        // Mount and explicit retry begin a bounded new attempt; a recovery already consumed its allowance.
        if (kind !== 'recovery') recoveryUsedRef.current = false
        scope.invalidate()
        commit(kind === 'recovery' ? { status: 'recovering' } : { status: 'loading' })
      }
      gateway.getSession(controller.signal).then(
        (session) => {
          if (inFlightRef.current !== token) return
          inFlightRef.current = null
          if (kind !== 'freshness') {
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
          if (error instanceof GatewayError && error.kind === 'api' && error.code === 'unauthenticated') {
            commit({ status: 'unauthenticated' })
            return
          }
          // Failed session validation may not leave protected data displayed (D2).
          commit({ status: 'error', message: error instanceof GatewayError ? error.message : 'The session could not be loaded.' })
        },
      )
    },
    [gateway, commit],
  )

  const abortInFlight = useCallback(() => {
    const inFlight = inFlightRef.current
    if (!inFlight) return
    inFlightRef.current = null
    inFlight.controller.abort()
  }, [])

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
        // Current 401 has priority over context recovery: clear and cancel immediately (D2).
        abortInFlight()
        scope.invalidate()
        commit({ status: 'unauthenticated' })
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
    [abortInFlight, commit, requestSession],
  )

  const contextId = state.status === 'ready' ? state.session.context_id : null
  const authorizationVersion = state.status === 'ready' ? state.session.authorization_version : null
  // AIDEV-NOTE: Context object identity is keyed to the identity fields so an unchanged freshness
  // response preserves in-flight reads and accumulated pages instead of restarting them (D2/D3).
  const context = useMemo<ReadContext | null>(
    () => (contextId !== null && authorizationVersion !== null ? { contextId, authorizationVersion } : null),
    [contextId, authorizationVersion],
  )

  const controller = useMemo<SessionController>(
    () => ({ state, scope: scopeRef.current, context, refresh, handleError }),
    [state, context, refresh, handleError],
  )

  return (
    <GatewayContext.Provider value={gateway}>
      <SessionContext.Provider value={controller}>{children}</SessionContext.Provider>
    </GatewayContext.Provider>
  )
}
