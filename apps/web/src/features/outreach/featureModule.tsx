import { lazy, type ReactElement } from 'react'
import type { OutreachPageProps } from './OutreachPages'

// AIDEV-NOTE: Outreach and sequence chunks are deferred; module-scope lazy components preserve page state.
const OutreachSequencePage = lazy(() => import('./SequencePage').then((page) => ({ default: page.OutreachSequencePage })))
const OutreachAccountDetailPage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachAccountDetailPage })))
const OutreachAccountsPage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachAccountsPage })))
const OutreachAnalyticsPage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachAnalyticsPage })))
const OutreachCampaignAccountsPage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachCampaignAccountsPage })))
const OutreachCampaignAnalyticsPage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachCampaignAnalyticsPage })))
const OutreachCampaignCreatePage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachCampaignCreatePage })))
const OutreachCampaignDetailPage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachCampaignDetailPage })))
const OutreachCampaignLeadsPage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachCampaignLeadsPage })))
const OutreachCampaignsPage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachCampaignsPage })))
const OutreachLeadsPage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachLeadsPage })))
const OutreachLeadDetailPage = lazy(() => import('./OutreachPages').then((page) => ({ default: page.OutreachLeadDetailPage })))

// Structural match for Fable's FeatureModule; Fable owns registration and navigation styling.
export interface OutreachFeatureModule {
  id: 'outreach'
  routes: string[]
  nav: Array<{ path: string; label: string; section: 'outreach'; order: number }>
  elements: Record<string, ReactElement>
}

export function createOutreachFeatureModule(props: OutreachPageProps): OutreachFeatureModule {
  const elements: Record<string, ReactElement> = {
    '/outreach/campaigns': <OutreachCampaignsPage {...props} />,
    '/outreach/campaigns/new': <OutreachCampaignCreatePage {...props} />,
    '/outreach/campaigns/:campaignId': <OutreachCampaignDetailPage {...props} />,
    '/outreach/campaigns/:campaignId/sequence': <OutreachSequencePage {...props} />,
    '/outreach/campaigns/:campaignId/leads': <OutreachCampaignLeadsPage {...props} />,
    '/outreach/campaigns/:campaignId/leads/:leadId': <OutreachLeadDetailPage {...props} />,
    '/outreach/campaigns/:campaignId/analytics': <OutreachCampaignAnalyticsPage {...props} />,
    '/outreach/leads': <OutreachLeadsPage {...props} />,
    '/outreach/accounts': <OutreachAccountsPage {...props} />,
    '/outreach/campaigns/:campaignId/accounts': <OutreachCampaignAccountsPage {...props} />,
    '/outreach/campaigns/:campaignId/accounts/:accountId': <OutreachAccountDetailPage {...props} />,
    '/outreach/analytics': <OutreachAnalyticsPage {...props} />,
  }
  return {
    id: 'outreach', routes: Object.keys(elements), elements,
    nav: [
      { path: '/outreach/campaigns', label: 'Campaigns', section: 'outreach', order: 10 },
      { path: '/outreach/leads', label: 'Leads', section: 'outreach', order: 20 },
      { path: '/outreach/accounts', label: 'Accounts', section: 'outreach', order: 30 },
      { path: '/outreach/analytics', label: 'Analytics', section: 'outreach', order: 40 },
    ],
  }
}
