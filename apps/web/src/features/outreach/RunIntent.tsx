import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useSession } from '@/app/session'
import type { CampaignRunInput } from './runContract'

export interface RunAttempt { input: CampaignRunInput; runId: string | null }
interface IntentStore {
  read(campaignId: string): RunAttempt | undefined
  save(campaignId: string, attempt: RunAttempt): void
  clear(campaignId: string): void
}
const Context = createContext<IntentStore | null>(null)
export function useRunIntent() {
  const store = useContext(Context)
  if (!store) throw new Error('RunIntentProvider missing')
  return store
}

// AIDEV-NOTE: Keep exact submitted inputs above routed recovery; never generate a new operation after a lost receipt.
export function RunIntentProvider({ children }: { children: ReactNode }) {
  const { state } = useSession()
  const principal = state.status === 'ready' ? `${state.session.actor.id}:${state.session.organization.id}` : null
  const owner = useRef<string | null>(null)
  const entries = useRef(new Map<string, RunAttempt>())
  const active = useRef(principal)
  active.current = principal
  const drop = ['unauthenticated', 'signing_out', 'no_organization'].includes(state.status)
  if (drop || (principal !== null && owner.current !== null && principal !== owner.current)) entries.current.clear()
  if (drop || principal !== null) owner.current = principal
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (![...entries.current.values()].some((entry) => entry.runId === null)) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const currentOwner = principal
  const store: IntentStore = {
    read: (id) => active.current === currentOwner && currentOwner !== null ? entries.current.get(id) : undefined,
    save: (id, attempt) => {
      if (active.current !== currentOwner || currentOwner === null) throw new Error('Campaign run owner changed')
      entries.current.set(id, attempt)
    },
    clear: (id) => { if (active.current === currentOwner && currentOwner !== null) entries.current.delete(id) },
  }
  return <Context.Provider value={store}>{children}</Context.Provider>
}
