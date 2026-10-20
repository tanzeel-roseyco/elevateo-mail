// Local-only "Starred" marks (INBOX-SPEC §2 star column). The backend has no star concept, so the
// set lives in this browser's localStorage, scoped by actor, organization and mailbox, and the UI
// labels it "on this device". It never claims server persistence.
//
// AIDEV-NOTE: Stored values are validated with zod on every read; a corrupt or foreign entry is
// treated as empty rather than trusted (boundary validation for browser storage).
import { useCallback, useSyncExternalStore } from 'react'
import { z } from 'zod'

const StoredSchema = z.array(z.string().uuid()).max(5000)

const PREFIX = 'elevateo.inbox.starred.'
const listeners = new Set<() => void>()
const cache = new Map<string, readonly string[]>()

// AIDEV-NOTE: Another tab's star changes (or a cleared storage) invalidate this tab's cache so a
// stale list is never written back over newer values (review finding, 2026-10-19).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null) cache.clear()
    else if (event.key.startsWith(PREFIX)) cache.delete(event.key)
    else return
    for (const listener of listeners) listener()
  })
}

function keyFor(scope: StarScope): string {
  return `${PREFIX}${scope.actorId}.${scope.organizationId}.${scope.mailboxId}`
}

function readStorage(key: string): readonly string[] {
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  let value: readonly string[] = []
  try {
    const raw = window.localStorage.getItem(key)
    if (raw !== null) {
      const parsed = StoredSchema.safeParse(JSON.parse(raw))
      if (parsed.success) value = parsed.data
    }
  } catch {
    // Blocked or unreadable storage: starring is simply unavailable until the next write succeeds.
  }
  cache.set(key, value)
  return value
}

function writeStorage(key: string, value: readonly string[]): void {
  cache.set(key, value)
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Per-device convenience only; a failed write keeps the in-memory value for this session.
  }
  for (const listener of listeners) listener()
}

export interface StarScope {
  readonly actorId: string
  readonly organizationId: string
  readonly mailboxId: string
}

export interface StarStore {
  readonly starred: ReadonlySet<string>
  isStarred(threadId: string): boolean
  toggle(threadId: string): void
}

/** Starred thread ids for one actor/organization/mailbox; `null` scope means starring is unavailable. */
export function useStarStore(scope: StarScope | null): StarStore {
  const key = scope === null ? null : keyFor(scope)
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  const snapshot = useSyncExternalStore(subscribe, () => (key === null ? EMPTY : readStorage(key)), () => EMPTY)
  const starred = new Set(snapshot)
  return {
    starred,
    isStarred: (threadId) => starred.has(threadId),
    toggle: (threadId) => {
      if (key === null) return
      // Re-read the persisted list rather than trusting the rendered snapshot (another tab may have written).
      cache.delete(key)
      const current = readStorage(key)
      const next = current.includes(threadId) ? current.filter((id) => id !== threadId) : [...current, threadId].slice(-5000)
      writeStorage(key, next)
    },
  }
}

const EMPTY: readonly string[] = []

/** Test seam: forget cached values so a test can start from a clean storage state. */
export function resetStarCache(): void {
  cache.clear()
}
