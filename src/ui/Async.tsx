import { AlertTriangle, WifiOff } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { EmptyState, Skeleton } from './Bits'
import { Button } from './Button'

// AIDEV-NOTE: Shared loading / error / offline plumbing for panels that fetch through MailroomGateway.

export type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string }

/** Runs `load` on mount and on retry. `load` must be a stable reference (a gateway method, not an inline closure). */
export function useLoad(load: () => Promise<unknown>): { state: LoadState; retry(): void } {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  useEffect(() => {
    // A response that lands after unmount or after a newer attempt must not overwrite current state.
    let current = true
    setState({ status: 'loading' })
    load().then(
      () => current && setState({ status: 'ready' }),
      (error: unknown) => current && setState({ status: 'error', message: error instanceof Error ? error.message : 'Something went wrong while loading.' }),
    )
    return () => {
      current = false
    }
  }, [load, attempt])
  return { state, retry: () => setAttempt((n) => n + 1) }
}

export function LoadGate({ state, retry, errorTitle, children }: { state: LoadState; retry(): void; errorTitle: string; children: ReactNode }) {
  if (state.status === 'loading') return <Skeleton rows={5} />
  if (state.status === 'error')
    return (
      <div role="alert">
        <EmptyState icon={AlertTriangle} title={errorTitle} body={state.message} action={<Button variant="primary" onClick={retry}>Try again</Button>} />
      </div>
    )
  return children
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Browser connectivity. `navigator.onLine` can report true on a captive network, so failures are still handled per request. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine)
}

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="flex items-center gap-2 border-b border-warn/40 bg-warn/10 px-4 py-2 text-[13px] text-fg">
      <WifiOff aria-hidden className="size-4 shrink-0 text-warn" />
      <p>
        <span className="font-semibold">You are offline.</span> You can keep reading and drafting from what is saved in this browser. Connecting mailboxes, imports and sending wait until you are back online.
      </p>
    </div>
  )
}
