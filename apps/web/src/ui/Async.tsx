// Loading / empty / error building blocks every page composes (acceptance criterion 4: each state has
// an icon, a title, a one-line explanation and a primary action). The empty state is EmailGuard's
// dashed card (DESIGN-SPEC §5.9); the error state is the same card with the red triangle.
import type { ReactNode } from 'react'
import { cx } from '@/lib/format'
import { ExclamationTriangleIcon, InboxIcon } from './icons'
import { Button } from './Button'

export function Skeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  // AIDEV-NOTE: Static skeleton fill remains visible on white and neutral surfaces without decorative motion.
  return (
    <div aria-hidden className={cx('flex flex-col gap-2', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 rounded bg-skeleton " />
      ))}
    </div>
  )
}

interface StateProps {
  title: string
  body?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}

/** Dashed empty-state card; `body` should stay a single line of explanation. */
export function EmptyState({ title, body, action, icon, className }: StateProps) {
  return (
    <div className={cx('mx-auto w-full max-w-md rounded-lg border border-dashed border-line p-5 ', className)}>
      <div className="flex flex-col items-center text-center">
        <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted  ">
          {icon ?? <InboxIcon className="size-5" />}
        </span>
        <h2 className="mt-3 font-medium text-fg ">{title}</h2>
        {body && <p className="mt-2 text-sm text-muted ">{body}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  )
}

/** Error card: red triangle, title, the server's one-line message and a Retry action. */
export function ErrorState({ title, body, action, className }: StateProps) {
  return (
    <div role="alert" className={cx('mx-auto w-full max-w-md rounded-lg border border-danger bg-danger-soft p-5  ', className)}>
      <div className="flex flex-col items-center text-center">
        <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger  ">
          <ExclamationTriangleIcon className="size-5" />
        </span>
        <h2 className="mt-3 font-medium text-fg ">{title}</h2>
        {body && <p className="mt-2 text-sm text-muted ">{body}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  )
}

export type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string }

export function LoadGate({ state, retry, errorTitle, children }: { state: LoadState; retry(): void; errorTitle: string; children: ReactNode }) {
  if (state.status === 'loading') return <div role="status" aria-label="Loading"><Skeleton rows={5} /></div>
  if (state.status === 'error')
    return <ErrorState title={errorTitle} body={state.message} action={<Button variant="primary" onClick={retry}>Try again</Button>} />
  return children
}
