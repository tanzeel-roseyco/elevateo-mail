// Flux table recipe (DESIGN-SPEC §5.12): borderless table with muted sm headers and hairline rows.
import type { ComponentProps } from 'react'
import { cx } from '@/lib/format'

export function Table({ className, children, ...rest }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cx('w-full table-auto text-sm', className)} {...rest}>
        {children}
      </table>
    </div>
  )
}

export function TH({ className, children, ...rest }: ComponentProps<'th'>) {
  return (
    <th scope="col" className={cx('border-b border-line px-3 py-3 text-start text-sm font-medium text-muted first:ps-0 last:pe-0  ', className)} {...rest}>
      {children}
    </th>
  )
}

export function TD({ className, children, ...rest }: ComponentProps<'td'>) {
  return (
    <td className={cx('border-b border-line px-3 py-3 text-sm text-fg first:ps-0 last:pe-0  ', className)} {...rest}>
      {children}
    </td>
  )
}
