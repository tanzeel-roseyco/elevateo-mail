// Flux separator: a hairline (DESIGN-SPEC §5.7). The page-header separator is `bg-zinc-800/5`; the
// stronger `bg-zinc-800/15` is used inside menus and integration cards.
import { cx } from '@/lib/format'

export function Separator({ strong = false, className }: { strong?: boolean; className?: string }) {
  return <div role="separator" className={cx('h-px w-full', strong ? 'bg-zinc-800/15 dark:bg-white/20' : 'bg-zinc-800/5 dark:bg-white/10', className)} />
}
