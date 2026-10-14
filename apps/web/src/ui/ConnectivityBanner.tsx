// Online-only shell notice (FE-805). Browser connectivity is a hint; the person explicitly
// reloads the session after a reported change. No offline cache or queue is implied.
// Browser and native HTTPS WebView share this path; there is no native IPC or background sync.
//
// AIDEV-NOTE: navigator.onLine can be wrong in either direction; actual API responses remain authoritative.
import { useEffect, useState } from 'react'
import { Button } from './Button'
import { AlertIcon } from './icons'

type Connectivity = 'online' | 'offline' | 'restored'

/** Tracks window online/offline events; 'restored' persists until the caller acknowledges it. */
export function useConnectivity(): { state: Connectivity; acknowledge(): void } {
  const [state, setState] = useState<Connectivity>(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online'))
  useEffect(() => {
    const onOffline = () => setState('offline')
    // Only a drop followed by a return is "restored"; a stray online event while online is ignored.
    const onOnline = () => setState((current) => (current === 'offline' ? 'restored' : current))
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])
  return { state, acknowledge: () => setState('online') }
}

export function ConnectivityBanner({ onReload }: { onReload(): void }) {
  const { state, acknowledge } = useConnectivity()
  if (state === 'online') return null
  if (state === 'offline') {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-fg">
        <AlertIcon className="size-4 shrink-0 text-warn" />
        <span className="min-w-0 flex-1">Your device reports a connection problem. Mail may be out of date; unsaved changes stay only in this window.</span>
      </div>
    )
  }
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-[13px] text-fg">
      <span className="min-w-0 flex-1">Your device reports a restored connection. Reload to check your session and current mail.</span>
      <Button size="sm" variant="primary" onClick={() => { acknowledge(); onReload() }}>Reload</Button>
      <Button size="sm" variant="ghost" onClick={acknowledge}>Dismiss</Button>
    </div>
  )
}
