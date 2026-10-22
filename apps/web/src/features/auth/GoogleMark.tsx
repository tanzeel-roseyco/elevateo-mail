// Monochrome "G" mark for the Google sign-in button. Google's four-colour logo carries a blue
// segment that the Elevateo design rule forbids as an accent, so the mark renders in currentColor
// (slate-950 on the gold primary button) and the visible label names the provider.
import type { SVGProps } from 'react'

export function GoogleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2.5a9.5 9.5 0 0 1 6.6 2.64l-2.3 2.3A6.27 6.27 0 0 0 12 5.75 6.25 6.25 0 1 0 18.06 13.5H12v-3.1h9.35c.1.56.15 1.13.15 1.72A9.5 9.5 0 1 1 12 2.5Z" />
    </svg>
  )
}
