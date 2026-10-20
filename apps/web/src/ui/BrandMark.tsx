// Authentic Elevateo mark from the design handoff (branding/elevateo-mail-logo-transparent.png,
// SHA-256 80f46c5f3edfcd4188175fb0d1814de18b4c188c45569da514e96d388c4a2368). public/brand/
// elevateo-mark-{64,180}.png are LANCZOS downscales of that file: no redraw, recolour or filter.
// The earlier elevateoco.com downloads (logo-mark-*.png) stay for provenance history only.
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
        src="/brand/elevateo-mark-64.png"
        srcSet="/brand/elevateo-mark-64.png 64w, /brand/elevateo-mark-180.png 180w"
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
