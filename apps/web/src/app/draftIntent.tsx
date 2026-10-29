// In-memory owner of unsaved draft intent that must outlive the recoverable protected subtree
// (design review fe02-cd-22 finding 1). A context recovery or identity-keyed remount unmounts
// the editor; the person's typed text, their raw recipient input and the exact unresolved save
// attempt (operation id + frozen payload + expected version) are kept HERE, keyed by the full
// owner (actor, organization, mailbox, draft), and handed back only to an editor that proved a
// current authorized read for that same owner. Memory never grants authority: no proof, token or
// server copy is stored, nothing is persisted to the browser, and nothing crosses tabs.
// AIDEV-NOTE: Lives between SessionProvider and the router (App.tsx) so it survives Shell's
// recovering frame and the keyed ProtectedShell; cleared on sign-out and on a principal change.
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { hasUnresolvedAttempt, isDirty, type DraftBuffer } from '@/domain/draftOperation'
import { reportDesktopBusy } from './desktopHost'
import { useSession } from './session'

export interface DraftIntent {
  buffer: DraftBuffer
  /** The To field exactly as typed, so recovery never silently normalizes incomplete recipients. */
  recipientsText: string
}

export function formatRecipients(to: DraftBuffer['savedContent']['to']): string {
  return to
    .map((a) => (a.display_name !== null && a.address !== null ? `${a.display_name} <${a.address}>` : (a.address ?? a.display_name ?? '')))
    .join('\n')
}

/** Raw formatting is memory-only intent even when parsing yields unchanged recipients. */
export function isDraftIntentDirty({ buffer, recipientsText }: DraftIntent): boolean {
  return isDirty(buffer) || recipientsText !== formatRecipients(buffer.savedContent.to)
}

export interface DraftIntentStore {
  read(key: string): DraftIntent | null
  write(key: string, intent: DraftIntent): void
  /** Transforms an EXISTING entry (late save outcomes); a cleared key is never recreated. */
  update(key: string, transform: (intent: DraftIntent) => DraftIntent): void
  clear(key: string): void
}

/** Full owner identity of one draft's local intent; a different actor or organization never matches. */
export function draftIntentKey(owner: { actorId: string; organizationId: string; mailboxId: string; draftId: string }): string {
  return [owner.actorId, owner.organizationId, owner.mailboxId, owner.draftId].join('\n')
}

const DraftIntentContext = createContext<DraftIntentStore | null>(null)

export function useDraftIntent(): DraftIntentStore {
  const store = useContext(DraftIntentContext)
  if (!store) throw new Error('DraftIntentContext missing')
  return store
}

export function DraftIntentProvider({ children }: { children: ReactNode }) {
  const { state } = useSession()
  const entriesRef = useRef(new Map<string, DraftIntent>())
  const unloadGuardRef = useRef<(() => void) | null>(null)
  const storeRef = useRef<DraftIntentStore | null>(null)
  if (storeRef.current === null) {
    const entries = entriesRef.current
    storeRef.current = {
      read: (key) => entries.get(key) ?? null,
      write: (key, intent) => {
        entries.set(key, intent)
        unloadGuardRef.current?.()
      },
      update: (key, transform) => {
        const existing = entries.get(key)
        if (existing !== undefined) entries.set(key, transform(existing))
        unloadGuardRef.current?.()
      },
      clear: (key) => {
        entries.delete(key)
        unloadGuardRef.current?.()
      },
    }
  }

  // AIDEV-NOTE: Guard retained normalized and raw edits through recovery unmounts; memory is not durable.
  useEffect(() => {
    let registered = false
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const sync = () => {
      const needed = [...entriesRef.current.values()].some((intent) => isDraftIntentDirty(intent) || hasUnresolvedAttempt(intent.buffer))
      // The same condition that guards a tab close also blocks a desktop update install.
      reportDesktopBusy('unsavedDraft', needed)
      if (needed === registered) return
      if (needed) window.addEventListener('beforeunload', warn)
      else window.removeEventListener('beforeunload', warn)
      registered = needed
    }
    unloadGuardRef.current = sync
    sync()
    return () => {
      unloadGuardRef.current = null
      if (registered) window.removeEventListener('beforeunload', warn)
    }
  }, [])

  // Session policy: sign-out (in flight or done), a session without organization, and a replaced
  // principal all drop every retained intent. Keys already stop cross-owner presentation; this
  // keeps the previous person's text out of memory as well. Temporary non-ready states
  // (loading, recovering, refreshing, retry_required, error) keep it for the same person.
  const principalRef = useRef<string | null>(null)
  const principal = state.status === 'ready' ? `${state.session.actor.id}\n${state.session.organization.id}` : null
  const dropsIntent = state.status === 'unauthenticated' || state.status === 'signing_out' || state.status === 'no_organization'
  useEffect(() => {
    if (dropsIntent) {
      entriesRef.current.clear()
      unloadGuardRef.current?.()
      principalRef.current = null
      return
    }
    if (principal === null) return
    if (principalRef.current !== null && principalRef.current !== principal) {
      entriesRef.current.clear()
      unloadGuardRef.current?.()
    }
    principalRef.current = principal
  }, [dropsIntent, principal])

  return <DraftIntentContext.Provider value={storeRef.current}>{children}</DraftIntentContext.Provider>
}
