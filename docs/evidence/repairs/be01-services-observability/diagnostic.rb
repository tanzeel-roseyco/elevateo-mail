# frozen_string_literal: true

module Be01Services
  # AIDEV-NOTE: Only fixed vocabulary reaches logs; never interpolate arbitrary exception messages or classes.
  module Diagnostic
    STAGES = %w[setup provision_owner provision_outsider persist_identities signup_denial invite_capture
                recovery_capture storage_seed completed_seed identities identity_owner identity_outsider
                password_token storage_check mark_ready].freeze
    ASSERTIONS = {
      "service phase" => "service_phase", "completed seed required" => "completed_seed",
      "provisioned identity" => "provisioned_identity", "password token identity" => "token_identity",
      "real token user lookup" => "token_user", "Auth identity UUID" => "identity_uuid",
      "retained Auth identity" => "retained_identity", "signup denial reason" => "signup_denial",
      "mail kind" => "mail_kind", "catcher message UUID" => "catcher_uuid",
      "invite capture timeout" => "invite_timeout", "recovery capture timeout" => "recovery_timeout",
      "fixture bucket" => "bucket_name", "fixture mailbox" => "mailbox_uuid",
      "server locator must match mailbox" => "locator", "service object read" => "object_read",
      "private bucket" => "private_bucket", "Storage exact bytes" => "object_bytes",
      "direct object denial" => "direct_denial", "public object denial" => "public_denial",
      "HTTP path" => "http_path", "HTTP response limit" => "http_limit",
      "JSON object required" => "json_object", "invalid JSON response" => "json_parse",
      "private bounded state file" => "state_file", "state object" => "state_object",
      "state UUID" => "state_uuid", "state nonce" => "state_nonce",
      "fixture password" => "state_password", "real identity pair" => "identity_pair"
    }.freeze

    def self.report(stage, error)
      safe_stage = STAGES.include?(stage) ? stage : "unclassified"
      assertion = "unexpected_error"
      if error.instance_of?(Failure)
        assertion = ASSERTIONS.fetch(error.message, "unclassified_assertion")
        # Response status is useful without exposing paths, bodies, keys, emails or callback URLs.
        match = /\A(auth|storage|mailpit) (GET|POST) status ([1-5][0-9]{2})\z/.match(error.message)
        assertion = "http_#{match[1]}_#{match[2]}_#{match[3]}" if match
      end
      "FAIL service fixture stage=#{safe_stage} assertion=#{assertion}"
    end
  end
end
