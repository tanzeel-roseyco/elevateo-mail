// Flux form recipes (DESIGN-SPEC §5.5): h-10 inputs with the zinc hairline, darker bottom edge and
// shadow-xs, sm labels, muted descriptions and the red error line. Shared by every form in the app
// so the sign-in, settings and compose forms read identically.
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '@/lib/format'
import { ChevronUpDownMiniIcon } from './icons'

export const inputClass =
  'w-full rounded-lg border border-zinc-200 border-b-zinc-300/80 bg-white ps-3 pe-3 text-base text-zinc-700 placeholder-zinc-400 shadow-xs sm:text-sm disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-zinc-300 dark:placeholder-zinc-500'

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
        <label htmlFor={id} className="text-sm font-medium text-zinc-800 dark:text-white">{label}</label>
        {labelAside}
      </div>
      {hint && <p id={`${id}-hint`} className="-mt-2 mb-3 text-sm text-zinc-500 dark:text-zinc-400">{hint}</p>}
      {children}
      {error && <p id={`${id}-error`} role="alert" className="mt-3 text-sm font-medium text-red-500 dark:text-red-400">{error}</p>}
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
      <ChevronUpDownMiniIcon className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
    </span>
  )
}

// Checked state paints the slate-950 tick on the gold fill (INBOX-SPEC §checkbox) via an inline SVG
// background so the control needs no extra markup.
const TICK =
  'url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path fill=%22none%22 stroke=%22%23020617%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M3.5 8.5l3 3 6-7%22/></svg>")'

export const checkboxClass =
  'size-4 shrink-0 cursor-pointer appearance-none rounded border border-zinc-300 bg-white shadow-xs checked:border-(--color-accent) checked:bg-(--color-accent) checked:bg-center checked:bg-no-repeat disabled:opacity-50 dark:border-white/20 dark:bg-white/10'

// `type` is excluded and fixed after the spread so a caller cannot turn the control into a text input.
export function Checkbox({ className, style, ...rest }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input className={cx(checkboxClass, 'checked:bg-(image:--tick)', className)} style={{ ...style, ['--tick' as string]: TICK }} {...rest} type="checkbox" />
}

/** Checkbox with its visible label (membership flags, selection boxes). */
export function CheckboxField({ id, label, className, ...rest }: Omit<ComponentProps<'input'>, 'type'> & { id: string; label: string }) {
  return (
    <label htmlFor={id} className={cx('inline-flex cursor-pointer items-center gap-3 text-sm text-zinc-800 dark:text-white', className)}>
      <Checkbox id={id} {...rest} />
      {label}
    </label>
  )
}
