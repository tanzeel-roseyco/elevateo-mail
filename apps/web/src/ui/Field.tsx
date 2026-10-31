// AIDEV-NOTE: Shared forms use white surfaces, gold outlines and explicit text errors across all flows.
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '@/lib/format'
import { ChevronUpDownMiniIcon } from './icons'

export const inputClass =
  'w-full rounded-lg border border-line border-b-line bg-surface ps-3 pe-3 text-base text-fg placeholder-muted shadow-xs sm:text-sm disabled:opacity-50    '

interface FieldProps {
  id: string
  label: string
  /** Muted description rendered under the label (Flux description slot). */
  hint?: string
  error?: string | null
  /** Optional trailing element on the label row, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode
  children: ReactNode
}

export function Field({ id, label, hint, error, labelAside, children }: FieldProps) {
  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-fg ">{label}</label>
        {labelAside}
      </div>
      {hint && <p id={`${id}-hint`} className="-mt-2 mb-3 text-sm text-muted ">{hint}</p>}
      {children}
      {error && <p id={`${id}-error`} role="alert" className="mt-3 text-sm font-medium text-danger ">{error}</p>}
    </div>
  )
}

export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={cx('h-10', inputClass, className)} />
}

export function TextArea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea {...rest} className={cx('min-h-24 py-2 font-sans leading-6', inputClass, className)} />
}

/** Native select with the Flux chevron, used for workspace/role/token-type choices. */
export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <span className={cx('relative block', className)}>
      <select {...rest} className={cx('h-10 appearance-none pe-9', inputClass)}>
        {children}
      </select>
      <ChevronUpDownMiniIcon className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </span>
  )
}

// AIDEV-NOTE: The token layer owns the black check artwork; the gold boundary stays visible when checked.
export const checkboxClass =
  'size-4 shrink-0 cursor-pointer appearance-none rounded border border-line bg-surface shadow-xs checked:border-line checked:bg-(--color-accent) checked:bg-center checked:bg-no-repeat disabled:opacity-50  '

// `type` is excluded and fixed after the spread so a caller cannot turn the control into a text input.
export function Checkbox({ className, style, ...rest }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input className={cx(checkboxClass, 'checked:bg-(image:--tick)', className)} style={style} {...rest} type="checkbox" />
}

/** Checkbox with its visible label (membership flags, selection boxes). */
export function CheckboxField({ id, label, className, ...rest }: Omit<ComponentProps<'input'>, 'type'> & { id: string; label: string }) {
  return (
    <label htmlFor={id} className={cx('inline-flex cursor-pointer items-center gap-3 text-sm text-fg ', className)}>
      <Checkbox id={id} {...rest} />
      {label}
    </label>
  )
}
