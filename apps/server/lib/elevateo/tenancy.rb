# frozen_string_literal: true

module Elevateo
  # AIDEV-NOTE: Tenant claims and cached rows must share one owned transaction and physical connection.
  module Tenancy
    class ContextError < StandardError; end

    UUID = /\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/

    Principal = Data.define(:user_id, :org_id) do
      def initialize(user_id:, org_id:)
        [user_id, org_id].each { |v| raise ContextError, "principal requires UUID values" unless v.is_a?(String) && UUID.match?(v) }
        # AIDEV-NOTE: Data is shallowly frozen; UUID strings must not mutate after claims establish frame identity.
        super(user_id: user_id.downcase.freeze, org_id: org_id.downcase.freeze)
      end
    end

    STACK_KEY = :elevateo_tenancy_principal
    Frame = Data.define(:principal, :connection, :transaction, :read_only)

    def self.active_frame?(frame, connection)
      frame.connection.equal?(connection) && connection.transaction_open? &&
        frame.transaction.equal?(connection.current_transaction) && frame.transaction.open?
    end

    def self.with_context(principal, connection: ActiveRecord::Base.connection, read_only: false)
      raise ContextError, "Principal required" unless principal.is_a?(Principal)
      outer = Thread.current[STACK_KEY]
      if outer
        unless outer.principal == principal && outer.read_only == read_only && active_frame?(outer, connection)
          raise ContextError, "nested context must retain principal, connection, transaction and mode"
        end
        return yield(connection)
      end
      raise ContextError, "tenant context cannot join an ambient transaction" if connection.transaction_open?

      connection.clear_query_cache
      connection.uncached(dirties: true) do
        ownership_lost = false
        begin
          # AIDEV-NOTE: Read authority and rows use one snapshot; Auth HTTP must finish before entering this frame.
          options = read_only ? { isolation: :repeatable_read } : {}
          connection.transaction(**options) do
            connection.execute("SET TRANSACTION READ ONLY") if read_only
            binds = [principal.user_id, principal.org_id].map do |value|
              ActiveRecord::Relation::QueryAttribute.new("tenant_uuid", value, ActiveRecord::Type::String.new)
            end
            # Adapter execution materializes Rails' lazy transaction before setting transaction-local claims.
            connection.exec_query(
              "SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)", "Tenant context", binds
            )
            frame = Frame.new(principal: principal, connection: connection,
                              transaction: connection.current_transaction, read_only: read_only)
            Thread.current[STACK_KEY] = frame
            begin
              yield(connection)
            ensure
              # AIDEV-NOTE: Check every exit, including caller exceptions, Rollback and non-local returns.
              unless active_frame?(frame, connection)
                ownership_lost = true
                raise ContextError, "owned tenant transaction ended or changed"
              end
            end
          end
        rescue StandardError => error
          # AIDEV-NOTE: Rails may mask our error while unwinding an externally emptied transaction stack.
          raise unless ownership_lost
          raise ContextError, "owned tenant transaction ended or changed", cause: error
        ensure
          begin
            # AIDEV-NOTE: Discard the physical session after ownership loss; replacement frames cannot be trusted.
            connection.disconnect! if ownership_lost
          ensure
            # Only the outer invocation clears its marker, after Rails unwinding and session disposal.
            Thread.current[STACK_KEY] = nil
            connection.clear_query_cache
          end
        end
      end
    end
  end
end
