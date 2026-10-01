import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { create } from 'zustand'
import { cx, uid } from '@/lib/format'

type ToastTone = 'info' | 'success' | 'error'

interface ToastItem {
  id: string
  message: string
  tone: ToastTone
  action?: { label: string; run(): void }
}

const useToasts = create<{ items: ToastItem[] }>()(() => ({ items: [] }))

const dismiss = (id: string) => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) }))

/** Lightweight feedback. Toasts with an action (e.g. Undo) stay longer so there is time to use it. */
export function toast(message: string, options: { tone?: ToastTone; action?: ToastItem['action'] } = {}): void {
  const id = uid('toast')
  useToasts.setState((s) => ({ items: [...s.items.slice(-3), { id, message, tone: options.tone ?? 'info', action: options.action }] }))
  setTimeout(() => dismiss(id), options.action ? 9000 : 5000)
}

const ICONS = { info: Info, success: CheckCircle2, error: AlertTriangle }

export function Toaster() {
  const items = useToasts((s) => s.items)
  return (
    // Bottom-left keeps toasts clear of the floating composer in the bottom-right.
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {items.map((item) => {
        const Icon = ICONS[item.tone]
        return (
          <div key={item.id} className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-fg px-3.5 py-2.5 text-surface shadow-lg">
            <Icon aria-hidden className={cx('mt-0.5 size-4 shrink-0', item.tone === 'error' && 'text-warn')} />
            <p className="min-w-0 flex-1 text-[13px]">
              {item.tone === 'error' && <span className="sr-only">Error: </span>}
              {item.message}
            </p>
            {item.action && (
              <button
                type="button"
                className="shrink-0 rounded px-1.5 text-[13px] font-semibold underline underline-offset-2"
                onClick={() => {
                  item.action?.run()
                  dismiss(item.id)
                }}
              >
                {item.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss notification" className="shrink-0 rounded p-0.5 opacity-80 hover:opacity-100" onClick={() => dismiss(item.id)}>
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
