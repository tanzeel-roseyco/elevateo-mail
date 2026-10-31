// Official artwork copied unchanged from assets/brand/elevateo-logo.png.
// AIDEV-NOTE: Preserve original artwork on white; never recolour it with CSS filters.
import { cx } from '@/lib/format'

// AIDEV-NOTE: The canonical logo is shared with the native asset catalogs.

interface BrandMarkProps {
  /** Rendered square icon size in CSS pixels. */
  size?: 24 | 28 | 36
  /** Pass true when visible text beside the mark already says "Elevateo Mail" (alt becomes ""). */
  decorative?: boolean
  className?: string
}

export function BrandMark({ size = 28, decorative = false, className }: BrandMarkProps) {
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-tile p-1', className)} data-testid="brand-mark">
      <img
        src="/brand/elevateo-logo.png"
        alt={decorative ? '' : 'Elevateo'}
        width={size}
        height={size}
        decoding="async"
        className="block object-contain"
        style={{ width: size, height: size }}
      />
    </span>
  )
}
