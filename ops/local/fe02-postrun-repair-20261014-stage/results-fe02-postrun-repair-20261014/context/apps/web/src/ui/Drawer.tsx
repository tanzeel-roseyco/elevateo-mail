// Mobile drawer over the approved @radix-ui/react-dialog primitive (accepted D6): initial focus,
// Tab/Shift+Tab containment, background inerting, Escape and dismissal focus restoration come from
// the primitive; no handwritten focus trapping. The trigger is rendered via asChild so Radix wires
// aria-expanded/aria-controls onto the caller's existing button and restores focus to it on close.
import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

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
        <Dialog.Overlay className="fixed inset-0 z-10 bg-black/40 md:hidden" />
        {/* md:hidden only hides overlay/content visuals; it does not disable Radix modal behavior
            (focus trap and background inerting persist while open). The caller's matchMedia close
            in Shell is what actually releases the dialog on a resize to desktop; actual-browser
            resize verification remains a coordinator visual check (D6, FE-R06). */}
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-10 w-72 max-w-[85vw] bg-surface shadow-lg md:hidden"
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
