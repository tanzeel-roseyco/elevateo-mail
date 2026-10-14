import type { ReactElement } from 'react'
import {
  OutreachAccountDetailPage, OutreachAccountsPage, OutreachAnalyticsPage, OutreachCampaignAccountsPage,
  OutreachCampaignAnalyticsPage, OutreachCampaignCreatePage, OutreachCampaignDetailPage,
  OutreachCampaignLeadsPage, OutreachCampaignsPage, OutreachLeadsPage,
  type OutreachPageProps,
} from './OutreachPages'

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
    '/outreach/campaigns/:campaignId/leads': <OutreachCampaignLeadsPage {...props} />,
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
