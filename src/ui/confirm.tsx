import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { create } from 'zustand'
import { buttonClass } from './Button'

// AIDEV-NOTE: Promise-based confirmation for destructive actions: `if (await confirm({...})) doIt()`.

interface ConfirmOptions {
  title: string
  body: string
  confirmLabel: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve(value: boolean): void }) | null
}

const useConfirm = create<ConfirmState>()(() => ({ request: null }))

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // A second request while one is open cancels the first rather than stacking dialogs.
    useConfirm.getState().request?.resolve(false)
    useConfirm.setState({ request: { ...options, resolve } })
  })
}

export function ConfirmHost() {
  const request = useConfirm((s) => s.request)
  const settle = (value: boolean) => {
    request?.resolve(value)
    useConfirm.setState({ request: null })
  }
  return (
    <AlertDialog.Root open={request !== null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[70] bg-black/45" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 text-fg shadow-xl">
          <AlertDialog.Title className="text-base font-semibold">{request?.title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted">{request?.body}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel className={buttonClass('secondary')}>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action className={buttonClass(request?.danger ? 'danger' : 'primary')} onClick={() => settle(true)}>
              {request?.confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
