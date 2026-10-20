// Flux modal recipe (DESIGN-SPEC §5.10) over the approved @radix-ui/react-dialog primitive: 500px
// white card, title + hairline, body, right-aligned footer and the top-end close button. Focus
// containment, Escape and focus restoration come from the primitive (D6); no handwritten trapping.
import * as Dialog from '@radix-ui/react-dialog'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { cx } from '@/lib/format'
import { IconButton } from './Button'
import { XMarkIcon } from './icons'

interface ModalProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  /** Optional one-line description announced with the dialog. */
  description?: string
  /** Optional opener rendered via asChild so Radix wires aria-* and focus return onto it. */
  trigger?: ReactNode
  /** Footer actions, usually [Cancel ghost][primary]. */
  footer?: ReactNode
  /** Wider variant for code-heavy content (integration snippets). */
  size?: 'md' | 'lg'
  children: ReactNode
}

export function Modal({ open, onOpenChange, title, description, trigger, footer, size = 'md', children }: ModalProps) {
  // AIDEV-NOTE: Radix's modal content always refocuses its own trigger on close, which is null for
  // controlled trigger-less dialogs (Add New Tag, Live Chat opened from a menu). The layout effect
  // runs before Radix's autofocus effect, so activeElement is still the opener; an element inside
  // another dialog or a menu (already closing) is not a usable opener and is skipped. With no
  // usable opener the Radix default applies, so browser evidence decides whether focus lands well.
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body && !active.closest('[role="dialog"], [role="menu"]') ? active : null
  }, [open])
  const restoreOpener = (event: Event) => {
    const target = opener.current
    if (target && target.isConnected) {
      event.preventDefault()
      target.focus()
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-zinc-800/15 backdrop-blur-xs dark:bg-black/40" />
        <Dialog.Content
          onCloseAutoFocus={restoreOpener}
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cx(
            'fixed start-1/2 top-1/2 z-30 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-lg dark:bg-zinc-800',
            size === 'lg' ? 'max-w-3xl' : 'max-w-[500px]',
          )}
        >
          <Dialog.Title className="pe-10 text-base font-medium text-zinc-800 dark:text-white">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</Dialog.Description>
          ) : null}
          <div className="mb-2 mt-1 h-px bg-zinc-800/5 dark:bg-white/10" />
          <Dialog.Close asChild>
            <IconButton label="Close" className="absolute end-0 top-0 me-4 mt-4 text-zinc-500">
              <XMarkIcon className="size-5" />
            </IconButton>
          </Dialog.Close>
          <div className="mt-4">{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
