// Memory-only approval binding above the recoverable shell. Never store CSRF or snapshot bytes.
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import type { SendApprovalInput } from '@/data/sendContract'
import { useSession } from './session'

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
  const entries = useRef(new Map<string, SendAttempt>())
  const store = useRef<SendIntentStore | null>(null)
  if (store.current === null) {
    const map = entries.current
    store.current = {
      read: (key) => map.get(key) ?? null,
      write: (key, attempt) => { map.set(key, attempt) },
      // AIDEV-NOTE: Late outcomes never recreate a binding cleared on logout or principal change.
      update: (key, update) => { const current = map.get(key); if (current) map.set(key, update(current)) },
      clear: (key) => { map.delete(key) },
    }
  }
  const principal = state.status === 'ready' ? `${state.session.actor.id}\n${state.session.organization.id}` : null
  const previous = useRef<string | null>(null)
  const drop = ['unauthenticated', 'signing_out', 'no_organization'].includes(state.status)
  useEffect(() => {
    if (drop || (principal !== null && previous.current !== null && principal !== previous.current)) entries.current.clear()
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
  return <Context.Provider value={store.current}>{children}</Context.Provider>
}
