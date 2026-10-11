// Adapted from first-party Ledger frontend 4322cfbb, src/ui/Async.tsx (blob bbea5da4…) and the
// EmptyState/Skeleton pieces of src/ui/Bits.tsx (blob 538cff01…).
// Changes: dropped lucide icons, useLoad/useOnline/OfflineBanner (session provider owns load
// lifecycle here) and the Bits pagination/callout/unsubscribe pieces.
import type { ReactNode } from 'react'
import { AlertIcon } from './icons'
import { Button } from './Button'

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-2 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-2" />
      ))}
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <AlertIcon className="size-5 text-muted" />
      <p className="text-sm font-semibold">{title}</p>
      {body && <p className="max-w-sm text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string }

export function LoadGate({ state, retry, errorTitle, children }: { state: LoadState; retry(): void; errorTitle: string; children: ReactNode }) {
  if (state.status === 'loading') return <div role="status" aria-label="Loading"><Skeleton rows={5} /></div>
  if (state.status === 'error')
    return (
      <div role="alert">
        <EmptyState title={errorTitle} body={state.message} action={<Button variant="primary" onClick={retry}>Try again</Button>} />
      </div>
    )
  return children
}
