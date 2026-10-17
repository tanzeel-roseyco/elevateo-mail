// Labelled form controls sharing the sign-in form's field styling so every C/D form reads the same.
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cx } from '@/lib/format'

export const inputClass = 'rounded-lg border border-line bg-surface px-3 text-sm text-fg disabled:opacity-55'

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-medium">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-[12px] text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-[12px] text-danger">{error}</p>}
    </div>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx('h-9', inputClass, className)} />
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx('min-h-24 py-2 font-sans leading-snug', inputClass, className)} />
}

/** Checkbox with its visible label; used for the three membership flags. */
export function CheckboxField({ id, label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-[13px]">
      <input id={id} type="checkbox" className="size-4 accent-[var(--accent)]" {...rest} />
      {label}
    </label>
  )
}
