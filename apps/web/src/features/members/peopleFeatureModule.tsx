import type { FeatureModule } from '@/app/features'
import { AdministrationPage } from './AdministrationPage'
import { PersonalSettingsPage } from './PersonalSettingsPage'

/** Fable registers this single module; all three routes live in the personal navigation section. */
export const peopleFeatureModule: FeatureModule = {
  id: 'lyra-people-settings',
  routes: ['/people', '/settings/personal', '/settings/organization'],
  nav: [
    { path: '/people', label: 'People', section: 'personal', order: 70 },
    { path: '/settings/personal', label: 'Personal settings', section: 'personal', order: 80 },
    { path: '/settings/organization', label: 'Organization settings', section: 'personal', order: 90 },
  ],
  elements: {
    '/people': <AdministrationPage section="people" />,
    '/settings/personal': <PersonalSettingsPage />,
    '/settings/organization': <AdministrationPage section="organization" />,
  },
}
