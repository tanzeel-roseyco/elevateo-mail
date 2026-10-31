// Mobile navigation drawer over the approved @radix-ui/react-dialog primitive (accepted D6): initial
// focus, Tab/Shift+Tab containment, background inerting, Escape and dismissal focus restoration come
// from the primitive; no handwritten focus trapping. The trigger is rendered via asChild so Radix
// wires aria-expanded/aria-controls onto the caller's existing button and restores focus on close.
// AIDEV-NOTE: The drawer exists below the lg breakpoint (1024px), matching EmailGuard's lg:hidden
// header; Shell closes it when the viewport grows past that width.
import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

/**
 * Escape pressed while a nested popup (workspace listbox, a Menu) is open belongs to that popup:
 * its own handler closes it and restores focus. Radix's document-level listener runs first, so the
 * drawer must decline the close. An open popup is detected through its expanded haspopup trigger
 * inside this dialog; disclosure buttons (sidebar collapse) carry no aria-haspopup and do not count.
 */
function escapeBelongsToNestedPopup(event: KeyboardEvent): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  const dialog = target.closest('[role="dialog"]')
  return dialog !== null && dialog.querySelector('[aria-haspopup][aria-expanded="true"]') !== null
}

interface DrawerProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** The visible opener; must forward props/ref to a real button (IconButton does). */
  trigger: ReactNode
  /** Accessible dialog name; rendered visually hidden. */
  title: string
  children: ReactNode
}

export function Drawer({ open, onOpenChange, trigger, title, children }: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 bg-overlay lg:hidden" />
        {/* lg:hidden only hides overlay/content visuals; it does not disable Radix modal behavior
            (focus trap and background inerting persist while open). The caller's matchMedia close
            in Shell is what actually releases the dialog on a resize to desktop (D6, FE-R06). */}
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => { if (escapeBelongsToNestedPopup(event)) event.preventDefault() }}
          className="fixed inset-y-0 start-0 z-20 w-66 max-w-[85vw] overflow-y-auto overscroll-contain border-e border-line bg-surface-2 shadow-lg lg:hidden  "
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
