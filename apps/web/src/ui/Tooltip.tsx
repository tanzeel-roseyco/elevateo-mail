// Flux tooltip: a small outlined white bubble shown on hover and keyboard focus. The wrapped control must
// carry its own accessible name (IconButton's aria-label) so the bubble is purely visual.
import { useState, type ReactNode } from 'react'
import { cx } from '@/lib/format'

interface TooltipProps {
  label: string
  side?: 'top' | 'bottom'
  className?: string
  children: ReactNode
}

export function Tooltip({ label, side = 'bottom', className, children }: TooltipProps) {
  // Escape hides the bubble (WCAG 1.4.13) until the pointer leaves or focus moves on.
  const [dismissed, setDismissed] = useState(false)
  return (
    <span
      className={cx('group/tip relative inline-flex', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setDismissed(true)
      }}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      {children}
      {!dismissed && (
        <span
          aria-hidden
          className={cx(
            'pointer-events-none invisible absolute start-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-fg opacity-0 shadow-sm  group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100 ',
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {label}
        </span>
      )}
    </span>
  )
}
