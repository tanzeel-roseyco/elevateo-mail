// Production wiring of Cassian's isolated V2 Outreach adapter to Celeste's OutreachGateway port
// (FE-805). Campaign, lead and analytics operations already agree by structure; only the two
// account operations differ in shape because the campaign-scoped account route is not registered
// yet, and the adapter rejects them before any dispatch. This bridge exists so the wiring is typed
// against Celeste's interface instead of a cast.
//
// AIDEV-NOTE: Delete this file once Cassian's adapter exposes campaign-scoped account signatures;
// main.tsx should then pass createV2OutreachGateway() straight through.
import type { createV2OutreachGateway } from '@/data/v2OutreachGateway'
import type { OutreachGateway } from '@/features/outreach/contract'

type V2OutreachGateway = ReturnType<typeof createV2OutreachGateway>

export function bridgeOutreachGateway(v2: V2OutreachGateway): OutreachGateway {
  return {
    listCampaigns: (ctx, query, signal) => v2.listCampaigns(ctx, query, signal),
    getCampaign: (ctx, campaignId, signal) => v2.getCampaign(ctx, campaignId, signal),
    createCampaign: (ctx, proof, input, signal) => v2.createCampaign(ctx, proof, input, signal),
    updateCampaign: (ctx, proof, campaignId, input, signal) => v2.updateCampaign(ctx, proof, campaignId, input, signal),
    listLeads: (ctx, campaignId, query, signal) => v2.listLeads(ctx, campaignId, query, signal),
    addLead: (ctx, proof, campaignId, input, signal) => v2.addLead(ctx, proof, campaignId, input, signal),
    updateLead: (ctx, proof, campaignId, leadId, input, signal) => v2.updateLead(ctx, proof, campaignId, leadId, input, signal),
    // Account scope is campaign-bound in the UI port but still unscoped (and inert) in the adapter.
    listAccounts: (ctx, _campaignId, query, signal) => v2.listAccounts(ctx, query, signal),
    getAccount: (ctx, _campaignId, accountId, signal) => v2.getAccount(ctx, accountId, signal),
    listAnalytics: (ctx, campaignId, signal) => v2.listAnalytics(ctx, campaignId, signal),
  }
}
