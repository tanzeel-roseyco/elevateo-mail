// Flux breadcrumbs (DESIGN-SPEC §5.14): "Home / Section / Current" with the current crumb muted.
import { Link } from 'react-router'
import { ChevronRightMiniIcon } from './icons'

export interface Crumb {
  label: string
  /** Omitted on the current page. */
  to?: string
}

export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 mt-2 text-sm font-medium">
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRightMiniIcon aria-hidden className="size-4 text-muted" />}
              {crumb.to && !last ? (
                <Link to={crumb.to} className="text-fg hover:underline ">{crumb.label}</Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="text-muted ">{crumb.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
