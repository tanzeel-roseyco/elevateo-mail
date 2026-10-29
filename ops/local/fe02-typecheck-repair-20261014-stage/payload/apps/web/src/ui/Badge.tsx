// Adapted from first-party Ledger frontend 4322cfbb, src/ui/Badge.tsx (blob b5db5ac6…).
// Changes: dropped lucide icons and the campaign/contact/delivery StatusBadge map; the read
// checkpoint only presents neutral/accent states (unread, truncation, development labels).
import type { ReactNode } from 'react'
import { cx } from '@/lib/format'

export type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'accent'

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2 text-fg',
  success: 'border-success/35 bg-success/10 text-success',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  accent: 'border-accent-text/30 bg-accent-soft text-accent-text',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  )
}
