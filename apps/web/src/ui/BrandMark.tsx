// Authentic Elevateo mark. The PNGs under public/brand are byte-identical downloads from
// elevateoco.com (SHA-256 recorded in docs/completion/fable.md); no redraw, recolor or filter.
// AIDEV-NOTE: The gold artwork sits on a fixed dark neutral tile in BOTH themes because gold has
// weak contrast on white; never use CSS invert/brightness to fake a light variant (brand provenance).
import { cx } from '@/lib/format'

// AIDEV-NOTE: Official square icons bound header downloads to 8-41 KB instead of the 3.48 MB master.

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
        src="/brand/logo-mark-64.png"
        srcSet="/brand/logo-mark-64.png 64w, /brand/logo-mark-180.png 180w"
        sizes={`${size}px`}
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
