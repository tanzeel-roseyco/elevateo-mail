# frozen_string_literal: true

module Elevateo
  # Single boundary for tenant-scoped reads. Claims are transaction-local and parameter-bound.
  module Tenancy
    class ContextError < StandardError; end

    UUID = /\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/

    Principal = Data.define(:user_id, :org_id) do
      def initialize(user_id:, org_id:)
        [user_id, org_id].each { |v| raise ContextError, "principal requires UUID values" unless v.is_a?(String) && UUID.match?(v) }
        super(user_id: user_id.downcase, org_id: org_id.downcase)
      end
    end

    STACK_KEY = :elevateo_tenancy_principal

    def self.with_context(principal, connection: ActiveRecord::Base.connection)
      raise ContextError, "Principal required" unless principal.is_a?(Principal)
      outer = Thread.current[STACK_KEY]
      if outer
        raise ContextError, "conflicting nested principal" unless outer == principal
        return yield(connection)
      end

      connection.transaction(requires_new: true) do
        raw = connection.raw_connection
        raw.exec_params("SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)",
                        [principal.user_id, principal.org_id])
        Thread.current[STACK_KEY] = principal
        begin
          yield(connection)
        ensure
          Thread.current[STACK_KEY] = nil
        end
      end
    end
  end
end
