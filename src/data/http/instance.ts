import { useStore } from 'zustand'
import { createHttpClient } from './httpClient'
import { createHttpGateway } from './httpGateway'
import { createLive, type Live, type LiveState } from './live'

// AIDEV-NOTE: Wires the API-backed mode for the browser. Requests are same-origin (/v1/...): the serving proxy forwards
// them, because the server enables no CORS. Imported only by the API-mode app, never by the demo.

type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

/** Browsers can block storage entirely, or allow reads but refuse writes; the session then lasts only as long as the page. */
function safeStorage(pick: () => Storage): KeyValue {
  try {
    const storage = pick()
    storage.setItem('elevateo:probe', '1')
    storage.removeItem('elevateo:probe')
    return storage
  } catch {
    const memory = new Map<string, string>()
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
      key: (index) => [...memory.keys()][index] ?? null,
      get length() {
        return memory.size
      },
    }
  }
}

/** First 24 hex characters of SHA-256: enough to tell accounts apart in storage keys without storing the token. */
async function namespace(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const live: Live = createLive({
  gateway: createHttpGateway(createHttpClient({ baseUrl: '', getToken: () => live.getToken() })),
  // The token stays in this tab's session storage: it is gone when the tab closes and is never written to disk-wide storage.
  session: safeStorage(() => sessionStorage),
  local: safeStorage(() => localStorage),
  namespace,
  now: () => Date.now(),
  newKey: () => crypto.randomUUID(),
})

export function useLive<T>(selector: (state: LiveState) => T): T {
  return useStore(live.store, selector)
}
