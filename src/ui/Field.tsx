import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cx } from '@/lib/format'

export const inputClass =
  'h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted disabled:opacity-60 aria-[invalid=true]:border-danger'

interface FieldProps {
  label: string
  hint?: string
  error?: string | null
  className?: string
  /** Receives the ids that wire the control to its label, hint, and error. */
  children(props: { id: string; 'aria-describedby': string | undefined; 'aria-invalid': boolean }): ReactNode
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) })}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputClass, 'h-auto py-2 leading-relaxed', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputClass, 'pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange(next: boolean): void; label: string; description?: string; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <span id={id} className="text-sm font-medium">
          {label}
        </span>
        {description && <p className="text-[13px] text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60', checked ? 'border-accent bg-accent' : 'border-line bg-surface-2')}
      >
        <span className={cx('absolute top-0.5 size-[18px] rounded-full shadow transition-all', checked ? 'left-[22px] bg-accent-fg' : 'left-0.5 bg-muted')} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  )
}

/** Labelled group of mutually exclusive options rendered as native radios styled like segments. */
export function Segmented<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: Array<{ value: T; label: string }>; onChange(value: T): void }) {
  const name = useId()
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium">{legend}</legend>
      <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
        {options.map((option) => (
          <label key={option.value} className={cx('cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-text', value === option.value ? 'bg-surface text-fg shadow-sm' : 'text-muted')}>
            <input type="radio" name={name} className="sr-only" checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
