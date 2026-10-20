import { lazy } from 'react'
import type { FeatureModule } from '@/app/features'

// AIDEV-NOTE: Sidebar registration stays synchronous; the page code downloads only when it opens.
// The former /settings/personal and /settings/organization routes now live inside the Settings
// area (features/settings/SettingsRoutes.tsx) and redirect from their old URLs.
const AdministrationPage = lazy(() => import('./AdministrationPage').then((page) => ({ default: page.AdministrationPage })))

/** Fable registers this single module: People under Contacts. */
export const peopleFeatureModule: FeatureModule = {
  id: 'lyra-people-settings',
  routes: ['/people'],
  nav: [{ path: '/people', label: 'People', section: 'contacts', order: 70 }],
  elements: {
    '/people': <AdministrationPage section="people" />,
  },
}
