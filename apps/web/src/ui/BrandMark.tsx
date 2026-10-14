// Authentic Elevateo mark (FE-805). The PNGs under public/brand are byte-identical downloads from
// elevateoco.com (SHA-256 recorded in docs/completion/fable.md); no redraw, recolor or filter.
// AIDEV-NOTE: The gold artwork sits on a fixed dark neutral tile in BOTH themes because gold has
// weak contrast on white; never use CSS invert/brightness to fake a light variant (brand provenance).
import { cx } from '@/lib/format'

/** logo-icon.png is 2487x2348; the height follows this ratio so object-fit never stretches the mark. */
const ICON_RATIO = 2487 / 2348

interface BrandMarkProps {
  /** Rendered icon width in CSS px; height follows the intrinsic ratio. */
  size?: 24 | 28 | 36
  /** Pass true when visible text beside the mark already says "Elevateo Mail" (alt becomes ""). */
  decorative?: boolean
  className?: string
}

export function BrandMark({ size = 28, decorative = false, className }: BrandMarkProps) {
  const width = size
  const height = Math.round(size / ICON_RATIO)
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-tile p-1', className)} data-testid="brand-mark">
      <img
        src="/brand/logo-icon.png"
        alt={decorative ? '' : 'Elevateo'}
        width={width}
        height={height}
        decoding="async"
        className="block object-contain"
        style={{ width, height }}
      />
    </span>
  )
}
