// Right-anchored modal sheet over the approved @radix-ui/react-dialog primitive, visible at every
// breakpoint (the mobile Drawer is left-anchored and md:hidden). Focus containment, Escape and
// dismissal focus restoration come from the primitive; no handwritten focus trapping (D6).
import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { IconButton } from './Button'
import { CloseIcon } from './icons'

interface SheetProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** The visible opener; must forward props/ref to a real button (IconButton/Button do). */
  trigger: ReactNode
  /** Accessible dialog name; rendered as the visible heading. */
  title: string
  children: ReactNode
}

export function Sheet({ open, onOpenChange, trigger, title, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-10 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-10 flex w-80 max-w-[90vw] flex-col bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close"><CloseIcon /></IconButton>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
