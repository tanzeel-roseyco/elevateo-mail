# frozen_string_literal: true

require "uri"
require_relative "auth_error"

module Elevateo
  class AuthentikDiscovery
    # AIDEV-NOTE: GoTrue v2.196 rejects absent ID tokens only when discovery supplies no userinfo fallback.
    def self.document(config)
      raise AuthError.unauthorized unless config.sso_enabled && config.sso_provider == "custom:authentik"
      issuer = config.authentik_issuer
      origin = URI.parse(issuer)
      raise AuthError.new unless origin.is_a?(URI::HTTPS) && origin.host
      base = "https://" + origin.host
      { "issuer" => issuer, "authorization_endpoint" => base + "/application/o/authorize/",
        "token_endpoint" => base + "/application/o/token/", "jwks_uri" => issuer + "jwks/",
        "response_types_supported" => ["code"], "subject_types_supported" => ["public"],
        "id_token_signing_alg_values_supported" => ["RS256"], "code_challenge_methods_supported" => ["S256"] }
    end
  end
end
