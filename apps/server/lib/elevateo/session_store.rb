# frozen_string_literal: true

require_relative "auth_input"
require_relative "request_deadline"

module Elevateo
  class SessionStore
    FUNCTIONS = {
      "enroll_company_identity" => %w[uuid uuid],
      "create_session" => %w[text uuid uuid text text timestamptz uuid text],
      "resolve_session" => %w[text], "authorize_session" => %w[text uuid uuid uuid bigint],
      "touch_session" => %w[text uuid uuid], "list_organizations" => %w[text uuid uuid uuid integer],
      "switch_organization" => %w[text uuid uuid uuid uuid text uuid bigint], "claim_refresh" => %w[text uuid],
      "publish_refresh" => %w[text uuid bigint uuid uuid text text timestamptz],
      "fail_refresh" => %w[text uuid bigint], "revoke_session" => %w[text text],
      "stage_entry" => %w[text text text], "claim_entry" => %w[text uuid],
      "verify_entry" => %w[text uuid uuid uuid text text timestamptz], "fail_entry" => %w[text uuid boolean],
      "complete_entry" => %w[text uuid text uuid text], "consume_entry_limits" => %w[text text],
      "claim_revocations" => %w[uuid integer], "finish_revocation" => %w[bigint uuid boolean]
    }.freeze
    SNAPSHOT_FUNCTIONS = %w[authorize_session list_organizations].freeze

    def initialize(pool: ActiveRecord::Base.connection_pool) = (@pool = pool)

    # AIDEV-NOTE: Only literal allowlisted function names form SQL; every caller value is a typed bound parameter.
    def call(name, arguments, deadline:, connection: nil)
      types = FUNCTIONS.fetch(name)
      raise ArgumentError, "incorrect session function arity" unless arguments.length == types.length
      if connection
        raise ArgumentError, "only authorization reads may share a snapshot" unless SNAPSHOT_FUNCTIONS.include?(name)
        return execute(connection, name, types, arguments, deadline)
      end
      result = @pool.with_connection do |owned|
        raise AuthError.new if owned.transaction_open?
        owned.uncached do
          owned.transaction(requires_new: true) { execute(owned, name, types, arguments, deadline) }
        end
      end
      raise AuthError.new unless result.is_a?(Hash)
      result
    rescue ActiveRecord::ActiveRecordError
      raise AuthError.new
    end

    def self.check!(result)
      case result["status"]
      when "ok" then result
      when "unauthorized", "refresh_uncertain" then raise AuthError.unauthorized
      when "not_found" then raise AuthError.unavailable
      when "context_changed" then raise AuthError.new("context_changed", status: 409)
      when "temporarily_unavailable" then raise AuthError.new(retry_after: 1)
      when "rate_limited"
        retry_after = result["retry_after"]
        raise AuthError.new unless retry_after.is_a?(Integer) && retry_after.positive?
        raise AuthError.new("rate_limited", status: 429, retry_after: [retry_after, 300].min)
      else raise AuthError.new
      end
    end

    private

    def execute(connection, name, types, arguments, deadline)
      # AIDEV-NOTE: Locks have a tighter cap than statements; both shrink with the caller's shared ten-second budget.
      statement_ms = [(deadline.timeout(3.0) * 1000).floor, 1].max
      lock_ms = [(deadline.timeout(1.0) * 1000).floor, 1].max
      connection.exec_query("SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $2, true)",
        "Session deadline", [bind(statement_ms.to_s), bind(lock_ms.to_s)])
      placeholders = types.each_with_index.map { |type, index| "$#{index + 1}::#{type}" }.join(", ")
      result = connection.exec_query("SELECT app_auth.#{name}(#{placeholders}) AS result", "Session boundary",
        arguments.map { |value| bind(value.nil? ? nil : value.to_s) }).first
      deadline.check!
      value = result && result["result"]
      value = AuthInput.object(value, maximum: 131_072) if value.is_a?(String)
      raise AuthError.new unless value.is_a?(Hash) && value["status"].is_a?(String)
      value
    end

    def bind(value) = ActiveRecord::Relation::QueryAttribute.new("session_argument", value, ActiveRecord::Type::String.new)
  end
end
