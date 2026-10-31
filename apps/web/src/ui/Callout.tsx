// Flux callout recipe (DESIGN-SPEC §5.4): tinted panel with icon, heading, text and actions. The
// accent variant is EmailGuard's blue announcement callout re-coloured gold; `neutral` is the grey
// "simulated UI adapter" / informational panel; `danger` carries inline request failures.
import type { ReactNode } from 'react'
import { cx } from '@/lib/format'
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from './icons'

export type CalloutVariant = 'brand-outline' | 'accent' | 'neutral' | 'danger' | 'warning' | 'success'

const VARIANTS: Record<CalloutVariant, { panel: string; icon: ReactNode }> = {
  // AIDEV-NOTE: Shared light-only notice recipe keeps PWA chrome aligned with the white/gold product design.
  'brand-outline': { panel: 'border-line bg-surface text-fg', icon: <InformationCircleIcon className="size-5" /> },
  accent: { panel: 'border-line bg-surface text-fg   ', icon: <InformationCircleIcon className="size-5" /> },
  neutral: { panel: 'border-line bg-surface-2 text-fg   ', icon: <InformationCircleIcon className="size-5" /> },
  danger: { panel: 'border-danger bg-danger-soft text-danger   ', icon: <XCircleIcon className="size-5" /> },
  warning: { panel: 'border-warn bg-warn-soft text-warn   ', icon: <ExclamationTriangleIcon className="size-5" /> },
  success: { panel: 'border-success bg-success-soft text-success   ', icon: <CheckCircleIcon className="size-5" /> },
}

interface CalloutProps {
  variant?: CalloutVariant
  /** `false` drops the icon column (the dashboard announcement banner has none). */
  icon?: boolean
  heading?: string
  children?: ReactNode
  actions?: ReactNode
  /** `alert` for failures that need immediate announcement, `status` for live updates, `note` otherwise. */
  role?: 'alert' | 'status' | 'note'
  /** Accessible name for the landmark-like note when there is no visible heading. */
  label?: string
  className?: string
}

export function Callout({ variant = 'neutral', icon = true, heading, children, actions, role = 'note', label, className }: CalloutProps) {
  const palette = VARIANTS[variant]
  return (
    <div role={role} aria-label={label} className={cx('flex rounded-xl border p-2', palette.panel, className)}>
      {icon ? (
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center">{palette.icon}</span>
      ) : (
        <span aria-hidden className="ps-2" />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-2 pe-3">
        {heading && <h3 className="text-sm font-medium">{heading}</h3>}
        {children && <div className="text-sm">{children}</div>}
        {actions && <div className="mt-1 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
