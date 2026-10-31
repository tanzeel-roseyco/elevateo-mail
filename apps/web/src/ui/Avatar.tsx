// Flux avatar: initials on a zinc tile (user menu) or a circle (message senders). Initials are
// derived locally; the app never loads remote avatar images.
import { cx } from '@/lib/format'

export function initialsOf(name: string): string {
  // Array.from splits by code point, so a supplementary-plane initial is never cut in half.
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = Array.from(parts[0] ?? '')[0] ?? ''
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1] ?? '')[0] ?? '') : ''
  const initials = (first + last).toUpperCase()
  return initials === '' ? '?' : initials
}

interface AvatarProps {
  name: string
  size?: 8 | 10
  shape?: 'square' | 'circle'
  className?: string
}

export function Avatar({ name, size = 8, shape = 'square', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center bg-surface-2 font-medium text-fg  ',
        size === 10 ? 'size-10 text-sm' : 'size-8 text-xs',
        shape === 'circle' ? 'rounded-full' : 'rounded-md',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}
