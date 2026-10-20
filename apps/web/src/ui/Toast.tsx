// Flux toast (DESIGN-SPEC §5.11): bottom-end stack of short confirmations ("Copied", "Tag saved").
// Toasts are polite live-region announcements, auto-dismiss after 5s and can be closed early.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from '@/lib/format'
import { IconButton } from './Button'
import { CheckCircleIcon, XCircleIcon, XMarkIcon } from './icons'

export type ToastVariant = 'success' | 'danger' | 'neutral'

interface ToastRecord {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast(message: string, variant?: ToastVariant): void
}

const ToastContext = createContext<ToastContextValue | null>(null)
const TOAST_MS = 5000

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      const id = nextId.current++
      setToasts((list) => [...list, { id, message, variant }])
      timers.current.set(id, setTimeout(() => dismiss(id), TOAST_MS))
    },
    [dismiss],
  )

  // Clear pending timers on unmount so tests and route unmounts never leak state updates.
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => clearTimeout(timer))
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 end-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex items-start gap-2 rounded-lg border bg-white p-3 text-sm shadow-lg dark:bg-zinc-800',
              t.variant === 'danger' ? 'border-red-200 dark:border-red-400/40' : 'border-zinc-200 dark:border-zinc-600',
            )}
          >
            <span aria-hidden className={cx('mt-0.5 shrink-0', t.variant === 'danger' ? 'text-red-500' : t.variant === 'success' ? 'text-green-600' : 'text-zinc-500')}>
              {t.variant === 'danger' ? <XCircleIcon className="size-4" /> : <CheckCircleIcon className="size-4" />}
            </span>
            <span className="flex-1 text-zinc-800 dark:text-white">{t.message}</span>
            <IconButton label="Dismiss" variant="subtle" className="-me-1 -mt-1 size-6" onClick={() => dismiss(t.id)}>
              <XMarkIcon className="size-4" />
            </IconButton>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
