// Flux typography recipes (DESIGN-SPEC §5.7): page/section headings, muted text and inline links.
import type { ComponentProps } from 'react'
import { Link as RouterLink } from 'react-router'
import { cx } from '@/lib/format'

type HeadingProps = ComponentProps<'h2'> & { as?: 'h1' | 'h2' | 'h3'; size?: 'lg' | 'xl' | 'base' }

export function Heading({ as: Tag = 'h2', size = 'base', className, ...rest }: HeadingProps) {
  return <Tag className={cx('font-medium text-zinc-800 dark:text-white', size === 'xl' ? 'text-xl' : size === 'lg' ? 'text-lg' : 'text-base', className)} {...rest} />
}

export function Subheading({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cx('text-sm text-zinc-500 dark:text-zinc-400', className)} {...rest} />
}

export function Text({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cx('text-sm text-zinc-800 dark:text-zinc-300', className)} {...rest} />
}

export function Muted({ className, ...rest }: ComponentProps<'span'>) {
  return <span className={cx('text-sm text-zinc-500 dark:text-zinc-400', className)} {...rest} />
}

export const linkClass = 'font-medium text-(--color-accent-content) underline-offset-4 hover:underline'

export function TextLink({ className, ...rest }: ComponentProps<typeof RouterLink>) {
  return <RouterLink className={cx(linkClass, className)} {...rest} />
}
