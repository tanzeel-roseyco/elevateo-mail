import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { MailroomGateway, ReadContext } from '@/data/gateway'
import type { Session } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { RequestScope } from './scope'

const REFRESH_MIN_INTERVAL_MS = 30_000

export type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }

export interface SessionController {
  state: SessionState
  scope: RequestScope
  /** Headers context while ready, otherwise null; it is consistency data, not authority. */
  context: ReadContext | null
  /** Explicit user retry / re-login bootstrap. */
  refresh(): void
  /**
   * Central 401/409 policy. Returns true when the error was consumed (stale, cleared session or
   * re-bootstrap started); pages render their own state for unconsumed errors.
   */
  handleError(error: unknown, generation: number): boolean
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
  // AIDEV-NOTE: At most one automatic re-bootstrap per confirmed context change (contract README).
  const rebootstrapUsedRef = useRef(false)
  const lastRefreshRef = useRef(0)

  const bootstrap = useCallback(
    (showLoading: boolean, fromContextChange = false) => {
      const scope = scopeRef.current
      const generation = scope.invalidate()
      if (showLoading) setState({ status: 'loading' })
      lastRefreshRef.current = Date.now()
      gateway.getSession().then(
        (session) => {
          if (!scope.isCurrent(generation)) return
          // A 409-triggered bootstrap keeps the guard set, else repeated 409s would loop forever.
          if (!fromContextChange) rebootstrapUsedRef.current = false
          setState({ status: 'ready', session })
        },
        (error: unknown) => {
          if (!scope.isCurrent(generation)) return
          if (error instanceof GatewayError && error.kind === 'api' && error.code === 'unauthenticated') {
            setState({ status: 'unauthenticated' })
            return
          }
          setState({ status: 'error', message: error instanceof GatewayError ? error.message : 'The session could not be loaded.' })
        },
      )
    },
    [gateway],
  )

  useEffect(() => {
    bootstrap(true)
  }, [bootstrap])

  // Refresh on focus/visibility, at most every 30 seconds while active.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastRefreshRef.current < REFRESH_MIN_INTERVAL_MS) return
      bootstrap(false)
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [bootstrap])

  const refresh = useCallback(() => {
    rebootstrapUsedRef.current = false
    bootstrap(true)
  }, [bootstrap])

  const handleError = useCallback(
    (error: unknown, generation: number): boolean => {
      const scope = scopeRef.current
      // A stale response (success or error) must not touch the current context (R3).
      if (!scope.isCurrent(generation)) return true
      if (!(error instanceof GatewayError) || error.kind !== 'api') return false
      if (error.code === 'unauthenticated') {
        scope.invalidate()
        setState({ status: 'unauthenticated' })
        return true
      }
      if (error.code === 'context_changed') {
        if (rebootstrapUsedRef.current) {
          scope.invalidate()
          setState({ status: 'error', message: 'Your access changed while loading. Retry to continue.' })
          return true
        }
        rebootstrapUsedRef.current = true
        bootstrap(true, true)
        return true
      }
      return false
    },
    [bootstrap],
  )

  const controller = useMemo<SessionController>(() => {
    const context: ReadContext | null =
      state.status === 'ready' ? { contextId: state.session.context_id, authorizationVersion: state.session.authorization_version } : null
    return { state, scope: scopeRef.current, context, refresh, handleError }
  }, [state, refresh, handleError])

  return (
    <GatewayContext.Provider value={gateway}>
      <SessionContext.Provider value={controller}>{children}</SessionContext.Provider>
    </GatewayContext.Provider>
  )
}
