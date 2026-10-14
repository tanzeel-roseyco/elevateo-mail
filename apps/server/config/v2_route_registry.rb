# frozen_string_literal: true

# AIDEV-NOTE: V2 is a reviewed registration plan; no route may be exposed without its owning controller and auth gate.
module V2RouteRegistry
  ROUTES = {
    "listOrganizationGrants" => ["GET", "/v2/organizations/:organization_id/grants", "v2/organization_grants#index"],
    "replaceOrganizationGrant" => ["PUT", "/v2/organizations/:organization_id/grants/:user_id", "v2/organization_grants#update"],
    "createOutreachCampaign" => ["POST", "/v2/outreach/campaigns", "v2/outreach_campaigns#create"],
    "getWorkerJob" => ["GET", "/v2/worker/jobs/:job_id", "v2/worker_jobs#show"]
  }.transform_values(&:freeze).freeze

  def self.register!(mapper, enabled:, controllers_ready:)
    return false unless enabled
    raise ArgumentError, "V2 controllers and authority gates are not ready" unless controllers_ready

    ROUTES.each_value do |verb, path, controller|
      mapper.public_send(verb.downcase, path, to: controller)
    end
    true
  end
end
