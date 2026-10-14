// Approval binding survives shell recovery and tab reload. Never store CSRF or snapshot bytes.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { SendApprovalInput } from '@/data/sendContract'
import { useSession } from './session'
import { approvalRecoveryMessage, clearApprovalRecovery, persistApprovalRecovery, readApprovalRecovery } from './approvalRecovery'

export interface SendAttempt {
  input: SendApprovalInput
  phase: 'pending' | 'uncertain' | 'approved'
  sendId: string | null
}
interface SendIntentStore {
  read(key: string): SendAttempt | null
  write(key: string, attempt: SendAttempt): void
  update(key: string, update: (attempt: SendAttempt) => SendAttempt): void
  clear(key: string): void
}
const Context = createContext<SendIntentStore | null>(null)
export function useSendIntent() {
  const store = useContext(Context)
  if (!store) throw new Error('SendIntentProvider missing')
  return store
}
export function SendIntentProvider({ children }: { children: ReactNode }) {
  const { state } = useSession()
  const principal = state.status === 'ready' ? `${state.session.actor.id}\n${state.session.organization.id}` : null
  const alive = useRef(true)
  const activePrincipal = useRef(principal)
  activePrincipal.current = principal
  const hydratedPrincipal = useRef<string | null>(null)
  const cleanupRequired = useRef(false)
  const [storageFailure, setStorageFailure] = useState(false)
  const entries = useRef(new Map<string, SendAttempt>())
  const store = useRef<SendIntentStore | null>(null)
  if (store.current === null) {
    const map = entries.current
    const scoped = (key: string): boolean => alive.current && activePrincipal.current !== null && key.startsWith(`${activePrincipal.current}\n`)
    const hydrate = () => {
      const current = activePrincipal.current
      if (current === null) throw new Error('Approval owner unavailable')
      if (cleanupRequired.current) { clearApprovalRecovery(); cleanupRequired.current = false }
      if (hydratedPrincipal.current === current) return
      map.clear()
      if (hydratedPrincipal.current !== null) clearApprovalRecovery()
      const recovered = readApprovalRecovery(current)
      recovered.forEach((attempt, key) => map.set(key, attempt))
      hydratedPrincipal.current = current
    }
    const commit = (next: Map<string, SendAttempt>) => {
      persistApprovalRecovery(next)
      map.clear(); next.forEach((attempt, key) => map.set(key, attempt))
    }
    store.current = {
      read: (key) => { if (!scoped(key)) return null; hydrate(); return map.get(key) ?? null },
      write: (key, attempt) => { if (!scoped(key)) throw new Error('Approval owner changed'); hydrate(); commit(new Map(map).set(key, attempt)) },
      // AIDEV-NOTE: Late outcomes never recreate a binding cleared on logout or principal change.
      update: (key, update) => { if (!scoped(key)) return; const current = map.get(key); if (current) commit(new Map(map).set(key, update(current))) },
      clear: (key) => { if (!scoped(key)) return; const next = new Map(map); next.delete(key); commit(next) },
    }
  }
  // AIDEV-NOTE: Capture this provider's map; unmount blocks late writes to a reloaded tab's metadata.
  useEffect(() => {
    const map = entries.current
    alive.current = true
    return () => { alive.current = false; map.clear() }
  }, [])
  const previous = useRef<string | null>(null)
  const drop = ['unauthenticated', 'signing_out', 'no_organization'].includes(state.status)
  useEffect(() => {
    if (drop || (principal !== null && previous.current !== null && principal !== previous.current)) {
      entries.current.clear(); hydratedPrincipal.current = null; cleanupRequired.current = true
      try { clearApprovalRecovery(); cleanupRequired.current = false; setStorageFailure(false) } catch { setStorageFailure(true) }
    }
    if (drop || principal !== null) previous.current = principal
  }, [drop, principal])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (![...entries.current.values()].some((attempt) => attempt.phase !== 'approved')) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  return <Context.Provider value={store.current}>{storageFailure && <p role="alert">{approvalRecoveryMessage}</p>}{children}</Context.Provider>
}
