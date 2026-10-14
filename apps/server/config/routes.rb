require_relative "v2_route_registry"

Rails.application.routes.draw do
  get "/health", to: "health#live"
  get "/ready", to: "health#ready"

  # AIDEV-NOTE: The callback stages opaque entry material; only the CSRF-protected POST consumes it.
  get "/auth/accept", to: "auth_entries#stage"
  get "/v1/auth/login-challenge", to: "v1/auth#challenge"
  post "/v1/auth/login", to: "v1/auth#login"
  post "/v1/auth/recovery", to: "v1/auth#recovery"
  post "/v1/auth/accept", to: "v1/auth#accept"
  post "/v1/auth/refresh", to: "v1/auth#refresh"
  post "/v1/auth/logout", to: "v1/auth#logout"
  get "/v1/session", to: "v1/sessions#show"
  post "/v1/session/organization", to: "v1/sessions#switch_organization"
  get "/v1/organizations", to: "v1/organizations#index"
  get "/v1/mailboxes", to: "v1/mailboxes#index"
  get "/v1/mailboxes/:mailbox_id/threads", to: "v1/threads#index"
  get "/v1/threads/:thread_id", to: "v1/threads#show"

  # AIDEV-NOTE: C/D routes use WriteController's guarded writes and the shared authorized read snapshots.
  get "/v1/drafts", to: "v1/drafts#index"
  get "/v1/drafts/:draft_id", to: "v1/drafts#show"
  put "/v1/drafts/:draft_id", to: "v1/drafts#update"
  get "/v1/draft-operations/:operation_id", to: "v1/draft_operations#show"
  put "/v1/threads/:thread_id/read-state", to: "v1/thread_read_states#update"
  get "/v1/threads/:thread_id/assignment", to: "v1/thread_assignments#show"
  put "/v1/threads/:thread_id/assignment", to: "v1/thread_assignments#update"
  get "/v1/threads/:thread_id/notes", to: "v1/thread_notes#index"
  post "/v1/threads/:thread_id/notes", to: "v1/thread_notes#create"
  get "/v1/mailboxes/:mailbox_id/members", to: "v1/mailbox_members#index"
  put "/v1/mailboxes/:mailbox_id/members/:user_id", to: "v1/mailbox_members#update"
  delete "/v1/mailboxes/:mailbox_id/members/:user_id", to: "v1/mailbox_members#destroy"
  # AIDEV-NOTE: BE03 uses independent SendError and defaults disabled until root accepts the SQL/auth bridge.
  get "/v1/drafts/:draft_id/send-review", to: "v1/send_reviews#show"
  post "/v1/drafts/:draft_id/send-approvals", to: "v1/send_approvals#create"
  get "/v1/send-intents/:send_id", to: "v1/send_intents#show"
  post "/v1/send-intents/:send_id/cancellation", to: "v1/send_intents#cancel"
  get "/v1/search", to: "v1/search#index"

  # AIDEV-NOTE: V2 stays absent until owning controllers and authority gates pass integration review.
  V2RouteRegistry.register!(self, enabled: true, controllers_ready: true, operations: %w[listOrganizationGrants getOrganizationRoster replaceOrganizationGrant listOutreachCampaigns getOutreachCampaign listOutreachLeads getOutreachLead getOutreachAnalytics])
end
