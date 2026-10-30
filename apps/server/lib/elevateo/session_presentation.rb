# frozen_string_literal: true

require "time"
require_relative "auth_input"
require_relative "session_store"

module Elevateo
  # AIDEV-NOTE: Wire versions are HMACs, never database generations; neither a version nor context grants authority.
  class SessionPresentation
    def initialize(crypto:) = (@crypto = crypto)

    def version(metadata)
      fields = %w[user_id organization_id authorization_generation].map { |field| metadata.fetch(field) }
      @crypto.sign(JSON.generate(fields), purpose: "authorization-version")
    end

    def check_context!(metadata, context, version)
      return if context.nil? && version.nil?
      raise AuthError.new("context_changed", status: 409) unless context == metadata["context_id"] &&
        @crypto.equal?(version, self.version(metadata))
    end

    def session(metadata, display_name: nil)
      SessionStore.check!(metadata)
      name = metadata["organization_name"]
      raise AuthError.new unless name.is_a?(String) && name.length <= 256
      { "context_id" => required(metadata, "context_id"), "authorization_version" => version(metadata),
        "actor" => { "id" => required(metadata, "user_id"), "display_name" => display_name },
        "organization" => { "id" => required(metadata, "organization_id"), "name" => name },
        "simulation_mode" => true, "csrf_token" => required(metadata, "csrf_token") }
    end

    def lifecycle(metadata, expires_at:, display_name: nil)
      { "session" => session(metadata, display_name: display_name), "access_expires_at" => expires_at.utc.iso8601 }
    end

    def required(metadata, key)
      value = metadata[key]
      raise AuthError.new unless value.is_a?(String) && !value.empty?
      value
    end
  end

  SessionIdentity = Data.define(:user_id, :org_id, :auth_session_id, :digest, :display_name, :metadata)
  SessionResult = Data.define(:cookie, :metadata, :expires_at, :display_name)
end
