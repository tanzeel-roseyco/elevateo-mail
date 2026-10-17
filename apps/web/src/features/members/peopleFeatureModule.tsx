import { lazy } from 'react'
import type { FeatureModule } from '@/app/features'

// AIDEV-NOTE: Sidebar registration stays synchronous; settings code downloads only when its page opens.
const AdministrationPage = lazy(() => import('./AdministrationPage').then((page) => ({ default: page.AdministrationPage })))
const PersonalSettingsPage = lazy(() => import('./PersonalSettingsPage').then((page) => ({ default: page.PersonalSettingsPage })))

/** Fable registers this single module: People under Contacts, the two settings pages under Settings. */
export const peopleFeatureModule: FeatureModule = {
  id: 'lyra-people-settings',
  routes: ['/people', '/settings/personal', '/settings/organization'],
  nav: [
    { path: '/people', label: 'People', section: 'contacts', order: 70 },
    { path: '/settings/personal', label: 'Personal', section: 'settings', order: 80 },
    { path: '/settings/organization', label: 'Organization', section: 'settings', order: 90 },
  ],
  elements: {
    '/people': <AdministrationPage section="people" />,
    '/settings/personal': <PersonalSettingsPage />,
    '/settings/organization': <AdministrationPage section="organization" />,
  },
}
