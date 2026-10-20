// Snooze chooser (Gmail "Snooze" menu): four relative presets from the domain rules plus
// "Remove snooze" when the thread is currently snoozed. The menu reports the chosen UTC instant
// (or null); the caller performs the write and reconciles the row from the server's answer.
import { Menu, MenuHeading, MenuItem, MenuSeparator } from '@/ui/Menu'
import { IconButton } from '@/ui/Button'
import { ClockIcon } from '@/ui/icons'
import { formatDateTime } from '@/lib/format'
import { isSnoozing, snoozePresets } from '@/domain/threadFolders'

interface Props {
  snoozedUntil: string | null
  disabled?: boolean | undefined
  /** Accessible name of the trigger; includes the subject when the menu sits on a row. */
  label?: string | undefined
  className?: string | undefined
  onSnooze(snoozedUntil: string | null): void
}

/**
 * Rendered only while the menu is open (Menu mounts its children on open), so the presets are
 * computed against the clock at the moment of opening, not when the row first rendered hours ago.
 */
function Presets({ onSnooze }: { onSnooze: (at: string) => void }) {
  return snoozePresets().map((preset) => (
    <MenuItem key={preset.key} onSelect={() => onSnooze(preset.at)}>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span>{preset.label}</span>
        <span className="text-xs text-zinc-400">{formatDateTime(preset.at)}</span>
      </span>
    </MenuItem>
  ))
}

export function SnoozeMenu({ snoozedUntil, disabled = false, label = 'Snooze', className, onSnooze }: Props) {
  const snoozing = isSnoozing(snoozedUntil)
  return (
    <Menu
      label={label}
      align="end"
      trigger={
        <IconButton label={label} disabled={disabled} className={className}>
          <ClockIcon className="size-5" />
        </IconButton>
      }
    >
      <MenuHeading>Snooze until</MenuHeading>
      <Presets onSnooze={onSnooze} />
      {snoozing && snoozedUntil !== null && (
        <>
          <MenuSeparator />
          <MenuHeading>Snoozed until {formatDateTime(snoozedUntil)}</MenuHeading>
          <MenuItem onSelect={() => onSnooze(null)}>Remove snooze</MenuItem>
        </>
      )}
    </Menu>
  )
}
