// Corporate buttons preserve the existing variant API and control geometry.
// AIDEV-NOTE: A double-weight gold outline and bold ink distinguish primary actions without large gold fills.
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from '@/lib/format'

export type ButtonVariant = 'brand-outline' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'subtle' | 'danger'
// `xs` is EmailGuard's h-10 button with 12px text (Get Help, View All …); `sm` is the h-8 control.
export type ButtonSize = 'xs' | 'sm' | 'md'

const OUTLINE =
  'bg-surface hover:bg-surface-2 border border-line border-b-line text-fg shadow-xs    '

const VARIANTS: Record<ButtonVariant, string> = {
  // AIDEV-NOTE: PWA controls use the white/gold recipe without changing existing product variants.
  'brand-outline': 'bg-white text-black border border-(--color-accent) hover:bg-zinc-50',
  primary:
    'bg-surface hover:bg-surface-2 text-fg border-2 border-line font-semibold',
  outline: OUTLINE,
  secondary: OUTLINE,
  ghost: 'bg-transparent hover:bg-surface-2 text-fg  ',
  subtle: 'bg-transparent hover:bg-surface-2 text-muted hover:text-fg   ',
  danger: 'bg-danger hover:bg-danger text-danger-fg border border-line ',
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
  /** React 19 ref prop; Menu merges it with its own trigger ref. */
  ref?: Ref<HTMLButtonElement>
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
