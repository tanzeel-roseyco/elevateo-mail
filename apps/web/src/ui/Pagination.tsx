// Gmail-style pager (INBOX-SPEC §toolbar): "1–50" range text with ‹ › ghost icon buttons. The
// backend pages by opaque cursor without a total, so the label shows the loaded range only.
import { IconButton } from './Button'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { Tooltip } from './Tooltip'

interface PaginationProps {
  rangeLabel: string
  hasPrev: boolean
  hasNext: boolean
  onPrev(): void
  onNext(): void
}

export function Pagination({ rangeLabel, hasPrev, hasNext, onPrev, onNext }: PaginationProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="me-1 text-sm text-muted ">{rangeLabel}</span>
      <Tooltip label="Newer">
        <IconButton label="Newer" variant="subtle" disabled={!hasPrev} onClick={onPrev}>
          <ChevronLeftIcon className="size-4" />
        </IconButton>
      </Tooltip>
      <Tooltip label="Older">
        <IconButton label="Older" variant="subtle" disabled={!hasNext} onClick={onNext}>
          <ChevronRightIcon className="size-4" />
        </IconButton>
      </Tooltip>
    </div>
  )
}
