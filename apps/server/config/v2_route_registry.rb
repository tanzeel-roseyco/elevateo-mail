# frozen_string_literal: true

# AIDEV-NOTE: V2 is a reviewed registration plan; no route may be exposed without its owning controller and auth gate.
module V2RouteRegistry
  ROUTES = {
    "listOutreachCampaigns" => ["GET", "/v2/outreach/campaigns", "v2/outreach/campaigns#index"],
    "getOutreachCampaign" => ["GET", "/v2/outreach/campaigns/:campaign_id", "v2/outreach/campaigns#show"],
    "createOutreachCampaign" => ["POST", "/v2/outreach/campaigns", "v2/outreach/campaigns#create"],
    "updateOutreachCampaign" => ["PUT", "/v2/outreach/campaigns/:campaign_id", "v2/outreach/campaigns#update"],
    "listOutreachLeads" => ["GET", "/v2/outreach/campaigns/:campaign_id/leads", "v2/outreach/leads#index"],
    "getOutreachLead" => ["GET", "/v2/outreach/campaigns/:campaign_id/leads/:lead_id", "v2/outreach/leads#show"],
    "addOutreachLead" => ["POST", "/v2/outreach/campaigns/:campaign_id/leads", "v2/outreach/leads#create"],
    "updateOutreachLead" => ["PUT", "/v2/outreach/campaigns/:campaign_id/leads/:lead_id", "v2/outreach/leads#update"],
    "getOutreachAnalytics" => ["GET", "/v2/outreach/campaigns/:campaign_id/analytics", "v2/outreach/analytics#show"],
    "listOrganizationGrants" => ["GET", "/v2/organizations/:organization_id/grants", "v2/admin/organization_grants#index"],
    "getOrganizationRoster" => ["GET", "/v2/organizations/:organization_id/roster", "v2/admin/organization_grants#roster"],
    "replaceOrganizationGrant" => ["PUT", "/v2/organizations/:organization_id/grants/:user_id", "v2/admin/organization_grants#update"],
    "getWorkerJob" => ["GET", "/v2/worker/jobs/:job_id", "v2/worker_jobs#show"],
    "getDirectMessage" => ["GET", "/v2/threads/:thread_id/messages/:message_id", "v1/threads#message"]
  }.transform_values(&:freeze).freeze

  def self.register!(mapper, enabled:, controllers_ready:, operations: ROUTES.keys)
    return false unless enabled
    raise ArgumentError, "V2 controllers and authority gates are not ready" unless controllers_ready

    unless operations.is_a?(Array) && operations.uniq == operations && operations.all? { |name| ROUTES.key?(name) }
      raise ArgumentError, "unknown or repeated V2 operation"
    end
    operations.each do |name|
      verb, path, controller = ROUTES.fetch(name)
      mapper.public_send(verb.downcase, path, to: controller)
    end
    true
  end
end
