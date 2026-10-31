// AIDEV-NOTE: Strong separators use gold; quiet decorative separators use neutral fill.
import { cx } from '@/lib/format'

export function Separator({ strong = false, className }: { strong?: boolean; className?: string }) {
  return <div role="separator" className={cx('h-px w-full', strong ? 'bg-line' : 'bg-surface-2', className)} />
}
