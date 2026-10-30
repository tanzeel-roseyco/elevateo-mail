// One protected request under the session's ownership rules (D2/D3): capture the scope generation
// and an AbortController before work, drop late successes AND failures once ownership moved on,
// and route 401/409 context_changed through the central policy. Writes get the session CSRF proof.
// AIDEV-NOTE: Every C/D panel uses this instead of re-deriving the guards; unmount aborts in a
// layout effect so a late completion cannot pass isCurrent in the post-paint cleanup window.
import { useCallback, useLayoutEffect, useRef } from 'react'
import type { CsrfProof, ReadContext } from '@/data/gateway'
import { useSession } from './session'

export type RequestOutcome<T> =
  | { kind: 'ok'; value: T }
  /** Ownership moved on (context invalidated, unmounted, or the central policy consumed the error): apply nothing. */
  | { kind: 'stale' }
  | { kind: 'failed'; error: unknown }

export interface ProtectedRequest {
  context: ReadContext | null
  /** Session CSRF proof for ordinary mutations; null outside a ready session. Never stored. */
  proof: CsrfProof | null
  request<T>(work: (ctx: ReadContext, signal: AbortSignal) => Promise<T>): Promise<RequestOutcome<T>>
}

export function useProtectedRequest(): ProtectedRequest {
  const { state, scope, context, handleError } = useSession()
  const proof: CsrfProof | null = state.status === 'ready' ? { csrfToken: state.session.csrf_token } : null
  const controllersRef = useRef(new Set<AbortController>())

  useLayoutEffect(() => {
    const controllers = controllersRef.current
    return () => {
      for (const controller of controllers) controller.abort()
      controllers.clear()
    }
  }, [])

  const request = useCallback(
    async <T>(work: (ctx: ReadContext, signal: AbortSignal) => Promise<T>): Promise<RequestOutcome<T>> => {
      if (!context) return { kind: 'stale' }
      const generation = scope.current()
      const controller = new AbortController()
      controllersRef.current.add(controller)
      const isCurrent = () => scope.isCurrent(generation) && !controller.signal.aborted
      try {
        const value = await work(context, controller.signal)
        if (!isCurrent()) return { kind: 'stale' }
        return { kind: 'ok', value }
      } catch (error) {
        if (!isCurrent()) return { kind: 'stale' }
        if (handleError(error, generation)) return { kind: 'stale' }
        return { kind: 'failed', error }
      } finally {
        controllersRef.current.delete(controller)
      }
    },
    [context, scope, handleError],
  )

  return { context, proof, request }
}
