import { lazy } from 'react'
import type { FeatureModule } from '@/app/features'

// AIDEV-NOTE: The registered page is lazy; its injected gateway follows the existing optional feature seam.
const EmailFinderPage = lazy(() => import('./EmailFinderPage').then((page) => ({ default: page.EmailFinderPage })))
export const emailFinderFeatureModule: FeatureModule = {
  id: 'email-finder', routes: ['/email-finder'],
  nav: [{ path: '/email-finder', label: 'Email finder', section: 'contacts', order: 80 }],
  elements: { '/email-finder': <EmailFinderPage /> },
}
