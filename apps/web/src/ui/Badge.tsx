// Flux badge recipe (DESIGN-SPEC §5.6): rounded-md, tinted background, strong text. `tone` keeps the
// legacy semantic API; `color` renders a tag colour chosen in Settings › Tags (one of the 20 swatches)
// as a tinted chip without needing a Tailwind class per colour.
import type { CSSProperties, ReactNode } from 'react'
import { cx } from '@/lib/format'

export type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'accent'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg  ',
  success: 'bg-success-soft text-success  ',
  warn: 'bg-warn-soft text-warn  ',
  danger: 'bg-danger-soft text-danger  ',
  accent: 'bg-surface text-fg  ',
}

interface BadgeProps {
  tone?: Tone
  /** A CSS colour (hex) for tag chips; overrides `tone`. */
  color?: string
  size?: 'sm' | 'md'
  pill?: boolean
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', color, size = 'md', pill = false, children, className }: BadgeProps) {
  // AIDEV-NOTE: User tag colours tint backgrounds only; fixed ink keeps arbitrary swatches readable.
  const style: CSSProperties | undefined = color
    ? { backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`, color: `var(--color-fg)` }
    : undefined
  return (
    <span
      style={style}
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap font-medium  ',
        pill ? 'rounded-full' : 'rounded-md',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        color ? undefined : TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
