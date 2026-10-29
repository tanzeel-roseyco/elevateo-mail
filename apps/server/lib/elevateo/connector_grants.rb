# frozen_string_literal: true

require_relative "connector_input"
require_relative "drafts/database"
require_relative "session_store"
require "securerandom"
require "digest"

module Elevateo
  # AIDEV-NOTE: All SQL identifiers are literals; private grants are reachable only through security-definer gates.
  class ConnectorGrants
    def initialize(connection:, session:)
      @database = Drafts::Database.new(connection: connection, session: session)
    end

    def issue(input, digest:)
      ConnectorInput.grant(input)
      token = SecureRandom.urlsafe_base64(48)
      scopes = input["scopes"]
      raise CollaborationError.new("request_invalid") unless scopes.is_a?(Array)
      result = @database.object("SELECT app.connector_grant_issue($1::text,$2::uuid,$3::text,$4::uuid,$5::text,$6::text[],$7::integer)::text AS result",
        [digest, SecureRandom.uuid, Digest::SHA256.hexdigest(token), WriteInput.uuid(input["mailbox_id"]),
         WriteInput.text(input["client"], maximum: 6), "{#{scopes.join(',')}}", input["expires_in_seconds"].to_s])
      SessionStore.check!(result)
      { "grant" => result.fetch("grant"), "token" => token }
    end

    def revoke(id, digest:)
      result = @database.object("SELECT app.connector_grant_revoke($1::text,$2::uuid)::text AS result", [digest, WriteInput.uuid(id)])
      SessionStore.check!(result)
      { "id" => result.fetch("id"), "revoked" => true }
    end

    def list
      row = @database.rows("SELECT app.connector_grants()::text AS result", []).first
      raise CollaborationError.new("internal_error") unless row
      result = ThreadProjection.source_json(row["result"], 65_536)
      raise CollaborationError.new("internal_error") unless result.is_a?(Hash)
      result
    end

    def resolve(token)
      hash = token_hash(token)
      row = @database.rows("SELECT app.connector_grant_resolve($1::text) AS digest", [hash]).first
      digest = row && row["digest"]
      raise AuthError.unauthorized unless digest.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(digest)
      digest
    end

    def authorize(token, digest:, mailbox:, scope:)
      row = @database.rows("SELECT app.connector_grant_authorize($1::text,$2::text,$3::uuid,$4::text) AS allowed",
        [digest, token_hash(token), mailbox, scope]).first
      raise CollaborationError.new("not_available") unless row && row["allowed"] == true
    end

    def token_hash(token)
      raise AuthError.unauthorized unless /\A[A-Za-z0-9_-]{32,256}\z/.match?(token)
      Digest::SHA256.hexdigest(token)
    end
  end
end
