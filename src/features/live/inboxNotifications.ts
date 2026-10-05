import { createStore, type StoreApi } from 'zustand/vanilla'
import type { LiveState } from '@/data/http/live'

export interface NotificationPort {
  requestPermission(): Promise<NotificationPermission>
  show(): { close(): void }
}
interface NotificationState { enabled: boolean; pending: boolean; error: string | null }
type Snapshot = Pick<LiveState, 'accountId' | 'session' | 'mailboxes'>
// AIDEV-NOTE: Session-only subscription survives route changes; no timers, message content, or persisted opt-in.
export function createInboxNotifications(source: Pick<StoreApi<Snapshot>, 'getState' | 'subscribe'>, port: NotificationPort | null) {
  const store = createStore<NotificationState>(() => ({ enabled: false, pending: false, error: null }))
  let generation = 0
  let owner: string | null = null
  let counts = new Map<string, number>()
  let displayed: { close(): void } | null = null
  const baseline = (state: Snapshot) => new Map(state.mailboxes.filter(m => m.connected && m.provider === 'gmail')
    .slice(0, 10).map(m => [m.id, m.arrivalCount ?? 0]))
  function disable() {
    generation++; owner = null; counts.clear(); displayed?.close(); displayed = null
    store.setState({ enabled: false, pending: false, error: null })
  }
  const unsubscribe = source.subscribe((state, previous) => {
    if (state.session.status !== 'ready' || state.accountId !== owner) { if (owner !== null) disable(); return }
    if (!store.getState().enabled || state.mailboxes === previous.mailboxes) return
    const next = baseline(state)
    const arrived = [...next].some(([id, count]) => counts.has(id) && count > counts.get(id)!)
    counts = next // New mailboxes and counter resets establish a baseline, never historical notifications.
    if (arrived && port) {
      try { displayed?.close(); displayed = port.show() }
      catch { disable(); store.setState({ error: 'Notifications could not be displayed. Check browser permissions.' }) }
    }
  })
  async function enable() {
    disable()
    const state = source.getState()
    if (!port) { store.setState({ error: 'This browser does not support notifications.' }); return }
    if (state.session.status !== 'ready' || !state.accountId) return
    owner = state.accountId
    const started = generation
    store.setState({ pending: true })
    try {
      const permission = await port.requestPermission()
      const current = source.getState()
      if (started !== generation || current.accountId !== owner || current.session.status !== 'ready') return
      if (permission !== 'granted') { disable(); store.setState({ error: 'Notifications are blocked or were not allowed.' }); return }
      counts = baseline(current)
      store.setState({ enabled: true, pending: false, error: null })
    } catch {
      if (started !== generation) return
      disable(); store.setState({ error: 'Notification permission could not be requested.' })
    }
  }
  return { store, enable, disable, destroy() { disable(); unsubscribe() } }
}
