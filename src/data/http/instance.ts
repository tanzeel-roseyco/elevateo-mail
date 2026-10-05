import { useStore } from 'zustand'
import { createHttpClient } from './httpClient'
import { createFixtureSignIn, createHttpGateway } from './httpGateway'
import { createLive, type Live, type LiveState } from './live'

// AIDEV-NOTE: Wires the API-backed mode for the browser. Requests are same-origin (/v1/...): the serving proxy forwards
// them, because the server enables no CORS. The session is an HttpOnly cookie the browser sends by itself. Imported only by the API-mode app, never by the demo.

type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

/**
 * Browsers can block storage entirely, or allow reads but refuse writes. The stand-in then refuses every write
 * rather than pretending: a recovery key that would vanish on reload must not be reported as stored.
 */
function safeStorage(pick: () => Storage): KeyValue {
  try {
    const storage = pick()
    storage.setItem('elevateo:probe', '1')
    storage.removeItem('elevateo:probe')
    return storage
  } catch {
    return {
      getItem: () => null,
      setItem: () => {
        throw new Error('Browser storage is unavailable.')
      },
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    }
  }
}

const http = createHttpClient({ baseUrl: '' })

export const live: Live = createLive({
  gateway: createHttpGateway(http),
  // AIDEV-NOTE: Only a build made for the Docker fixture (VITE_FIXTURE_SESSION=1) can start a synthetic session.
  fixture: import.meta.env.VITE_FIXTURE_SESSION === '1' ? createFixtureSignIn(http) : null,
  session: safeStorage(() => sessionStorage),
  // Holds idempotency keys of unanswered submissions and change markers for other tabs. Never a token or message text.
  local: safeStorage(() => localStorage),
  now: () => Date.now(),
  newKey: () => crypto.randomUUID(),
})

export function useLive<T>(selector: (state: LiveState) => T): T {
  return useStore(live.store, selector)
}
