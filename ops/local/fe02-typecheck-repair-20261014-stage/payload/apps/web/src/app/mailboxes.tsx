// Shares the already-loaded mailbox list (the sole capability source, GET /v1/mailboxes) with the
// routed pages so they can show or hide compose/member controls. Capabilities here are display
// hints only: the server re-checks authority on every request and a 404/409/401 wins over them.
// AIDEV-NOTE: Lives inside the keyed ProtectedShell, so a replaced identity starts with no list.
import { createContext, useContext, type ReactNode } from 'react'
import type { Mailbox } from '@/data/contract'

export type MailboxesSnapshot = { status: 'loading' } | { status: 'ready'; mailboxes: readonly Mailbox[] } | { status: 'error' }

// AIDEV-NOTE: No provider (isolated route, component test) reads as 'loading': controls stay
// visible and the server's answer decides. A throw here would make every page depend on Shell.
const MailboxesContext = createContext<MailboxesSnapshot>({ status: 'loading' })

export function MailboxesProvider({ value, children }: { value: MailboxesSnapshot; children: ReactNode }) {
  return <MailboxesContext.Provider value={value}>{children}</MailboxesContext.Provider>
}

export function useMailboxes(): MailboxesSnapshot {
  return useContext(MailboxesContext)
}

/** The selected mailbox when known; `undefined` while loading or when it is not visible to the actor. */
export function useMailbox(mailboxId: string): Mailbox | undefined {
  const snapshot = useMailboxes()
  return snapshot.status === 'ready' ? snapshot.mailboxes.find((m) => m.id === mailboxId) : undefined
}
