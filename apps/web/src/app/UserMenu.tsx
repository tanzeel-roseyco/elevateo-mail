// Profile dropdown (DESIGN-SPEC §3 footer, §4 mobile header): avatar + name trigger, the current
// user as a checked radio, then sign-out. Both sign-out scopes stay available (BE-02A); the
// session controller fences protected content before the request leaves the browser.
import type { Session } from '@/data/contract'
import { cx } from '@/lib/format'
import { Avatar } from '@/ui/Avatar'
import { ArrowRightStartOnRectangleIcon, ChevronUpDownMiniIcon, ShieldCheckIcon, UserIcon } from '@/ui/icons'
import { Menu, MenuItem, MenuLink, MenuRadio, MenuSeparator } from '@/ui/Menu'
import { useSession } from './session'

interface UserMenuProps {
  session: Session
  /** Avatar-only trigger for the mobile header. */
  compact?: boolean
  /** Accessible name of the trigger; the mobile header uses a distinct name so tests can target each. */
  label?: string
  /** Footer menus open upward; the mobile header menu opens downward. */
  side?: 'top' | 'bottom'
  className?: string
}

export function UserMenu({ session, compact = false, side = 'top', className, label = 'Account and sign-out' }: UserMenuProps) {
  const { signOut } = useSession()
  const name = session.actor.display_name ?? 'Unnamed user'
  return (
    <Menu
      side={side}
      align={compact ? 'end' : 'start'}
      label="Account"
      className={cx(compact ? undefined : 'w-full', className)}
      trigger={
        <button type="button" aria-label={label} className="group flex w-full items-center rounded-lg p-1 hover:bg-zinc-800/5 dark:hover:bg-white/10">
          <Avatar name={name} />
          {!compact && <span className="mx-2 min-w-0 truncate text-sm font-medium text-zinc-500 group-hover:text-zinc-800 dark:text-zinc-400 dark:group-hover:text-white">{name}</span>}
          <span className="ms-auto flex size-8 shrink-0 items-center justify-center text-zinc-400">
            <ChevronUpDownMiniIcon className="size-4" />
          </span>
        </button>
      }
    >
      <MenuRadio checked onSelect={() => undefined}>
        {name}
      </MenuRadio>
      <MenuSeparator />
      <MenuLink to="/settings/profile" icon={<UserIcon className="size-4" />}>
        Profile
      </MenuLink>
      <MenuItem icon={<ArrowRightStartOnRectangleIcon className="size-4" />} onSelect={() => void signOut('local')}>
        Sign out
      </MenuItem>
      <MenuItem icon={<ShieldCheckIcon className="size-4" />} onSelect={() => void signOut('global')}>
        Sign out everywhere
      </MenuItem>
    </Menu>
  )
}
