// Flux badge recipe (DESIGN-SPEC §5.6): rounded-md, tinted background, strong text. `tone` keeps the
// legacy semantic API; `color` renders a tag colour chosen in Settings › Tags (one of the 20 swatches)
// as a tinted chip without needing a Tailwind class per colour.
import type { CSSProperties, ReactNode } from 'react'
import { cx } from '@/lib/format'

export type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'accent'

const TONES: Record<Tone, string> = {
  neutral: 'bg-zinc-400/15 text-zinc-700 dark:bg-zinc-400/40 dark:text-zinc-200',
  success: 'bg-green-400/15 text-green-800 dark:bg-green-400/40 dark:text-green-200',
  warn: 'bg-amber-400/15 text-amber-800 dark:bg-amber-400/40 dark:text-amber-200',
  danger: 'bg-red-400/15 text-red-800 dark:bg-red-400/40 dark:text-red-200',
  accent: 'bg-gold-400/15 text-gold-800 dark:bg-gold-400/40 dark:text-gold-200',
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
  // Tag colours are tinted the way Flux tints its named colours: 15% background and text mixed
  // towards the surface's ink (black on light, white on dark via --badge-ink) so it stays readable.
  const style: CSSProperties | undefined = color
    ? { backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`, color: `color-mix(in oklab, ${color} 55%, var(--badge-ink))` }
    : undefined
  return (
    <span
      style={style}
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap font-medium [--badge-ink:black] dark:[--badge-ink:white]',
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
