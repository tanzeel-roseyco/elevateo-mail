import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '@/lib/format'
import { IconButton } from './Button'

interface ModalProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: string
  /** `right`/`left` render a full-height sheet (contact panel, mobile navigation). */
  side?: 'center' | 'right' | 'left'
  children: ReactNode
}

const PLACEMENT = {
  center: 'left-1/2 top-1/2 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl',
  right: 'right-0 top-0 h-full w-full max-w-md border-l',
  left: 'left-0 top-0 h-full w-72 max-w-[85vw] border-r',
}

// Radix handles focus trapping, Escape, and returning focus to the trigger.
export function Modal({ open, onOpenChange, title, description, side = 'center', children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cx('fixed z-50 flex flex-col overflow-hidden border-line bg-surface text-fg shadow-xl', PLACEMENT[side])}
        >
          <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-0.5 text-[13px] text-muted">{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close">
                <X aria-hidden className="size-4" />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
