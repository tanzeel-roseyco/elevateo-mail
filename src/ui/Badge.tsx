import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, FileText, Pause, Play, Reply, ShieldQuestion, SkipForward, UserMinus, XCircle, type LucideIcon } from 'lucide-react'
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

export function Badge({ tone = 'neutral', icon: Icon, children, className }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {Icon && <Icon aria-hidden className="size-3.5" />}
      {children}
    </span>
  )
}

// AIDEV-NOTE: Every status pairs an icon and a word with its tone, so meaning never depends on colour alone.
const STATUS: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  // delivery
  pending: { label: 'Pending', tone: 'neutral', icon: Clock },
  delivered: { label: 'Delivered', tone: 'success', icon: CheckCircle2 },
  bounced: { label: 'Bounced', tone: 'danger', icon: AlertTriangle },
  failed: { label: 'Failed', tone: 'danger', icon: XCircle },
  skipped: { label: 'Skipped', tone: 'warn', icon: SkipForward },
  // campaign
  draft: { label: 'Draft', tone: 'neutral', icon: FileText },
  scheduled: { label: 'Scheduled', tone: 'accent', icon: Clock },
  running: { label: 'Running', tone: 'success', icon: Play },
  paused: { label: 'Paused', tone: 'warn', icon: Pause },
  completed: { label: 'Completed', tone: 'neutral', icon: CheckCircle2 },
  // contact
  subscribed: { label: 'Subscribed', tone: 'success', icon: CheckCircle2 },
  unsubscribed: { label: 'Unsubscribed', tone: 'warn', icon: UserMinus },
  suppressed: { label: 'Suppressed', tone: 'danger', icon: Ban },
  opted_in: { label: 'Opted in', tone: 'success', icon: CheckCircle2 },
  unconfirmed: { label: 'Consent unconfirmed', tone: 'warn', icon: ShieldQuestion },
  replied: { label: 'Replied', tone: 'accent', icon: Reply },
  // domain verification
  verified: { label: 'Verified', tone: 'success', icon: CheckCircle2 },
}

export function StatusBadge({ status, prefix }: { status: string; prefix?: string }) {
  const meta = STATUS[status] ?? { label: status, tone: 'neutral' as const, icon: CircleDashed }
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {prefix ? `${prefix} ${meta.label.toLowerCase()}` : meta.label}
    </Badge>
  )
}
