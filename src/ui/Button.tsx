import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg shadow-sm hover:brightness-110',
  secondary: 'border border-line bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-danger-fg hover:brightness-110',
}
const SIZES: Record<Size, string> = { sm: 'h-8 gap-1.5 px-2.5 text-[13px]', md: 'h-9 gap-2 px-3.5 text-sm' }

export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md') =>
  cx('inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-55', VARIANTS[variant], SIZES[size])

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(buttonClass(variant, size), className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also shown as the tooltip. */
  label: string
  children: ReactNode
}

export function IconButton({ label, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx('inline-flex size-8 shrink-0 items-center justify-center rounded-full text-fg transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...rest}
    >
      {children}
    </button>
  )
}
