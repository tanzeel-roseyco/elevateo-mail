// Flux dropdown menu (DESIGN-SPEC §5.8) without a new dependency: a button trigger, an absolutely
// positioned panel, roving arrow-key focus, Escape/outside-click dismissal and focus return.
// AIDEV-NOTE: Items query `[role^="menuitem"]` inside the panel, so every item must render one of
// MenuItem / MenuLink / MenuRadio (all role=menuitem*). Disabled items stay focusable but inert
// (aria-disabled), matching the WAI-ARIA menu pattern.
import { cloneElement, createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, KeyboardEvent, ReactElement, ReactNode, Ref } from 'react'
import { Link } from 'react-router'
import { cx } from '@/lib/format'
import { CheckMiniIcon } from './icons'

interface MenuContextValue {
  close(): void
}
const MenuContext = createContext<MenuContextValue | null>(null)

function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('Menu items must be rendered inside <Menu>')
  return ctx
}

type TriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }

interface MenuProps {
  /** A button element; Menu injects aria-haspopup/aria-expanded/aria-controls and the handlers. */
  trigger: ReactElement<TriggerProps>
  /** Horizontal alignment of the panel relative to the trigger. */
  align?: 'start' | 'end'
  /** Opens below the trigger by default; `top` for footer menus such as the sidebar user menu. */
  side?: 'top' | 'bottom'
  /** Accessible name of the menu; defaults to the trigger's text. */
  label?: string
  className?: string
  children: ReactNode
}

function focusableItems(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return []
  return Array.from(panel.querySelectorAll<HTMLElement>('[role^="menuitem"]'))
}

export function Menu({ trigger, align = 'start', side = 'bottom', label, className, children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const pendingFocus = useRef<'first' | 'last' | null>(null)
  const id = useId()

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const openWith = (focus: 'first' | 'last') => {
    pendingFocus.current = focus
    setOpen(true)
  }

  // Focus the requested item once the panel is in the DOM.
  useEffect(() => {
    if (!open || !pendingFocus.current) return
    const items = focusableItems(panelRef.current)
    const target = pendingFocus.current === 'first' ? items[0] : items[items.length - 1]
    pendingFocus.current = null
    target?.focus()
  }, [open])

  // Outside pointer-down closes without stealing focus back to the trigger.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Dismissal keys work even for an empty menu; only the movement keys need items.
    if (event.key === 'Escape') {
      event.preventDefault()
      return close()
    }
    if (event.key === 'Tab') {
      // Tabbing away is not a menu action; let focus move on and shut the panel.
      return setOpen(false)
    }
    const items = focusableItems(panelRef.current)
    if (items.length === 0) return
    const current = items.findIndex((item) => item === document.activeElement)
    const move = (index: number) => {
      event.preventDefault()
      items[(index + items.length) % items.length]?.focus()
    }
    switch (event.key) {
      case 'ArrowDown':
        return move(current + 1)
      case 'ArrowUp':
        return move(current - 1)
      case 'Home':
        return move(0)
      case 'End':
        return move(items.length - 1)
      default:
        return undefined
    }
  }

  const triggerProps: TriggerProps = {
    // Keep the caller's own ref working alongside the menu's (callback or object ref).
    ref: (node: HTMLButtonElement | null) => {
      triggerRef.current = node
      const callerRef = trigger.props.ref
      if (typeof callerRef === 'function') callerRef(node)
      else if (callerRef) callerRef.current = node
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
    onClick: (event) => {
      trigger.props.onClick?.(event)
      if (event.defaultPrevented) return
      if (open) close()
      else openWith('first')
    },
    onKeyDown: (event) => {
      trigger.props.onKeyDown?.(event)
      if (event.defaultPrevented) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        openWith('first')
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        openWith('last')
      }
    },
  }

  return (
    <MenuContext.Provider value={{ close }}>
      <div className={cx('relative inline-block', className)}>
        {cloneElement(trigger, triggerProps)}
        {open && (
          <div
            ref={panelRef}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onPanelKeyDown}
            className={cx(
              'absolute z-20 min-w-48 rounded-lg border border-zinc-200 bg-white p-[.3125rem] shadow-xs dark:border-zinc-600 dark:bg-zinc-700',
              align === 'end' ? 'end-0' : 'start-0',
              side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
          >
            {children}
          </div>
        )}
      </div>
    </MenuContext.Provider>
  )
}

const ITEM =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-white dark:hover:bg-zinc-600 dark:focus-visible:bg-zinc-600'

interface MenuItemProps {
  onSelect?(): void
  icon?: ReactNode
  disabled?: boolean
  /** Red text for destructive actions. */
  danger?: boolean
  children: ReactNode
}

export function MenuItem({ onSelect, icon, disabled = false, danger = false, children }: MenuItemProps) {
  const { close } = useMenu()
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      className={cx(ITEM, danger && 'text-red-600 dark:text-red-400', !danger && '[&_svg]:text-zinc-400')}
      onClick={() => {
        if (disabled) return
        close()
        onSelect?.()
      }}
    >
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  )
}

interface MenuLinkProps {
  to: string
  icon?: ReactNode
  external?: boolean
  children: ReactNode
}

export function MenuLink({ to, icon, external = false, children }: MenuLinkProps) {
  const { close } = useMenu()
  // An in-app link changes the page, which owns focus next; an external link opens a new tab, so
  // focus returns to the trigger here instead of being lost with the removed menu item.
  const onClick = () => close(false)
  if (external) {
    return (
      <a href={to} target="_blank" rel="noreferrer noopener" role="menuitem" tabIndex={-1} className={cx(ITEM, '[&_svg]:text-zinc-400')} onClick={() => close(true)}>
        {icon}
        <span className="flex-1">{children}</span>
      </a>
    )
  }
  return (
    <Link to={to} role="menuitem" tabIndex={-1} className={cx(ITEM, '[&_svg]:text-zinc-400')} onClick={onClick}>
      {icon}
      <span className="flex-1">{children}</span>
    </Link>
  )
}

interface MenuRadioProps {
  checked: boolean
  onSelect(): void
  children: ReactNode
}

/** Radio-style item with the check column on the start side (Flux `menu.radio`). */
export function MenuRadio({ checked, onSelect, children }: MenuRadioProps) {
  const { close } = useMenu()
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={-1}
      className={ITEM}
      onClick={() => {
        close()
        onSelect()
      }}
    >
      <span className="flex size-4 items-center justify-center">{checked && <CheckMiniIcon className="size-4" />}</span>
      <span className="flex-1">{children}</span>
    </button>
  )
}

export function MenuSeparator() {
  return <div role="separator" className="-mx-[.3125rem] my-[.3125rem] h-px bg-zinc-800/15 dark:bg-white/20" />
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <p className="px-2 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{children}</p>
}
