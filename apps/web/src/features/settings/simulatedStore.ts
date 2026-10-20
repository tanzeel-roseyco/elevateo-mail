// Simulated UI adapters for settings the backend does not own (workspace name, invitations, tags,
// API tokens, webhooks). Values live in this browser's localStorage scoped by actor and
// organization; every page that uses one shows the "Simulated UI adapter" callout so nobody
// mistakes a local save for server persistence. Nothing here calls the network.
//
// AIDEV-NOTE: Same discipline as inbox/starStore.ts: zod validates every read, a corrupt or foreign
// entry falls back to the schema default, and a blocked storage keeps an in-memory value only.
import { useCallback, useSyncExternalStore } from 'react'
import type { z } from 'zod'
import { useSession } from '@/app/session'

const PREFIX = 'elevateo.settings.'
const listeners = new Set<() => void>()
const cache = new Map<string, unknown>()

// AIDEV-NOTE: Another tab writing, removing or clearing storage must not leave this tab's cache
// stale (review P2): drop the affected keys and re-render subscribers on every storage event.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null) cache.clear()
    else if (event.key.startsWith(PREFIX)) cache.delete(event.key)
    else return
    for (const listener of listeners) listener()
  })
}

/**
 * `fresh` re-reads persisted storage even when a cached value exists (read-modify-write). When
 * storage throws (blocked, private mode), the cached in-memory value survives instead of being
 * replaced by the fallback, so memory-only records are never lost between two updates.
 */
function readStorage<T>(key: string, schema: z.ZodType<T>, fallback: T, fresh = false): T {
  if (!fresh && cache.has(key)) return cache.get(key) as T
  let value: T
  try {
    const raw = window.localStorage.getItem(key)
    value = fallback
    if (raw !== null) {
      const parsed = schema.safeParse(JSON.parse(raw))
      if (parsed.success) value = parsed.data
    }
  } catch {
    value = cache.has(key) ? (cache.get(key) as T) : fallback
  }
  cache.set(key, value)
  return value
}

function writeStorage<T>(key: string, value: T): void {
  cache.set(key, value)
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Local convenience only; the in-memory value still drives this session.
  }
  for (const listener of listeners) listener()
}

export interface SimulatedStore<T> {
  /** Current value, or the fallback when there is no ready session. */
  readonly value: T
  /** `false` while no session scope exists; writes are ignored then. */
  readonly writable: boolean
  set(next: T): void
  /**
   * Read-modify-write against the freshly read stored value (not the rendered snapshot), so a
   * change made meanwhile in another tab is not silently overwritten. Returning `null` aborts.
   */
  update(mutate: (current: T) => T | null): void
}

/**
 * A localStorage-backed value named `name`, scoped to the signed-in actor and organization.
 * `schema` validates stored data; `fallback` is used when nothing valid is stored.
 */
export function useSimulatedStore<T>(name: string, schema: z.ZodType<T>, fallback: T): SimulatedStore<T> {
  const { state } = useSession()
  const key = state.status === 'ready' ? `${PREFIX}${name}.${state.session.actor.id}.${state.session.organization.id}` : null
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  const value = useSyncExternalStore(
    subscribe,
    () => (key === null ? fallback : readStorage(key, schema, fallback)),
    () => fallback,
  )
  return {
    value,
    writable: key !== null,
    set: (next) => {
      if (key !== null) writeStorage(key, next)
    },
    update: (mutate) => {
      if (key === null) return
      const next = mutate(readStorage(key, schema, fallback, true))
      if (next !== null) writeStorage(key, next)
    },
  }
}

/** Short random id for simulated records (no server id exists). */
export function simulatedId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Test seam: forget cached values so a test can start from a clean storage state. */
export function resetSimulatedCache(): void {
  cache.clear()
}
