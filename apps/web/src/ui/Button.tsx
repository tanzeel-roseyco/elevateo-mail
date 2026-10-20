// Flux button recipes (DESIGN-SPEC §5.1) in Elevateo gold. Variants map onto EmailGuard's
// primary / outline / ghost / danger buttons; `secondary` is kept as the outline alias used by
// pre-existing pages, so no legacy call site changes meaning.
// AIDEV-NOTE: Primary is gold with slate-950 text (8.4:1); never white-on-gold (2.4:1 fails AA).
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/format'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'subtle' | 'danger'
// `xs` is EmailGuard's h-10 button with 12px text (Get Help, View All …); `sm` is the h-8 control.
export type ButtonSize = 'xs' | 'sm' | 'md'

const OUTLINE =
  'bg-white hover:bg-zinc-50 border border-zinc-200 border-b-zinc-300/80 text-zinc-800 shadow-xs dark:bg-zinc-700 dark:hover:bg-zinc-600/75 dark:border-white/10 dark:text-white'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-(--color-accent) hover:bg-[color-mix(in_oklab,var(--color-accent),transparent_10%)] text-(--color-accent-foreground) border border-black/10 shadow-[inset_0_1px_rgb(255_255_255/0.2)]',
  outline: OUTLINE,
  secondary: OUTLINE,
  ghost: 'bg-transparent hover:bg-zinc-800/5 text-zinc-800 dark:hover:bg-white/15 dark:text-white',
  subtle: 'bg-transparent hover:bg-zinc-800/5 text-zinc-500 hover:text-zinc-800 dark:hover:bg-white/15 dark:text-zinc-400 dark:hover:text-white',
  danger: 'bg-red-500 hover:bg-red-600 text-white border border-black/10 shadow-[inset_0_1px_rgb(255_255_255/0.2)]',
}
// Captured recipes: "Get Help"/"View All" are h-10 text-xs rounded-lg (ps-3 pe-4 with a trailing
// icon); the h-8 controls are rounded-md; plain h-10 buttons use px-4.
const SIZES: Record<ButtonSize, string> = {
  xs: 'h-10 gap-2 px-3 text-xs rounded-lg',
  sm: 'h-8 gap-2 px-3 text-sm rounded-md',
  md: 'h-10 gap-2 px-4 text-sm rounded-lg',
}

export const buttonClass = (variant: ButtonVariant = 'outline', size: ButtonSize = 'md') =>
  cx(
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium [&_svg]:shrink-0 disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
  )

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Leading icon slot (Heroicons mini/micro at size-4). */
  icon?: ReactNode
  /** Trailing icon slot, e.g. the arrow-up-right on "View All" buttons. */
  iconTrailing?: ReactNode
  /** Shows a spinner and disables the button while an action is in flight. */
  loading?: boolean
}

export function Button({ variant = 'outline', size = 'md', icon, iconTrailing, loading = false, className, children, type = 'button', disabled, ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(buttonClass(variant, size), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
      {iconTrailing}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also shown as the native tooltip. */
  label: string
  variant?: Extract<ButtonVariant, 'ghost' | 'subtle' | 'outline'>
  size?: 'sm' | 'md'
  children: ReactNode
}

/** Square icon-only button (Flux `icon` buttons): ghost by default, size-8 unless `md` (size-10). */
export function IconButton({ label, variant = 'ghost', size = 'sm', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center [&_svg]:shrink-0 disabled:pointer-events-none disabled:opacity-50',
        size === 'md' ? 'size-10 rounded-lg' : 'size-8 rounded-md',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('size-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
