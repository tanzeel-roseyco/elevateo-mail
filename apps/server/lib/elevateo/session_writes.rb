# frozen_string_literal: true

require_relative "sessions"
require_relative "tenancy"
require_relative "write_response"
require_relative "read_response"
require_relative "write_statements"
require "securerandom"

module Elevateo
  class SessionWrites
    def initialize(sessions:) = (@sessions = sessions)

    # AIDEV-NOTE: The only Auth HTTP call precedes this helper; session/generation guards live until serialized commit.
    def transaction(identity, context:, version:, csrf:, guard_users:, budget:, deadline:, &operation)
      # AIDEV-NOTE: Defer our timeout across ownership changes; native I/O and COMMIT have no wall-time guarantee.
      Thread.handle_interrupt(RequestDeadline::Expired => :never) do
        execute(identity, context: context, version: version, csrf: csrf,
          guard_users: guard_users, budget: budget, deadline: deadline, &operation)
      end
    rescue Tenancy::ContextError, ReadResponse::Overflow
      raise CollaborationError.new("internal_error")
    rescue ActiveRecord::ActiveRecordError
      raise CollaborationError.new("temporarily_unavailable", retry_after: 1)
    end

    private

    def execute(identity, context:, version:, csrf:, guard_users:, budget:, deadline:)
      targets = guard_users.map { |user| WriteInput.uuid(user) }.uniq
      raise CollaborationError.new("request_invalid") if guard_users.length > 2
      principal = Tenancy::Principal.new(user_id: identity.user_id, org_id: identity.org_id)
      result = with_write_connection(deadline) do |connection|
        Tenancy.with_context(principal, connection: connection) do
          Thread.handle_interrupt(RequestDeadline::Expired => :immediate) do
            statements = WriteStatements.new(connection, deadline)
            metadata = acquire(statements, identity, targets, deadline)
            SessionStore.check!(metadata)
            unless metadata["organization_id"] == identity.org_id
              raise CollaborationError.new("context_changed")
            end
            # AIDEV-NOTE: Presentation permits proof-free lifecycle reads; protected writes must never take that path.
            unless context.is_a?(String) && version.is_a?(String)
              raise CollaborationError.new("request_invalid")
            end
            @sessions.presentation.check_context!(metadata, context, version)
            unless @sessions.crypto.equal?(metadata["csrf_token"], csrf)
              raise CollaborationError.new("request_invalid")
            end
            session = @sessions.presentation.session(metadata, display_name: identity.display_name)
            deadline.check!
            response = yield(connection: statements, session: session)
            raise CollaborationError.new("internal_error") unless response.is_a?(WriteResponse)
            response.verify!(budget: budget)
            deadline.check!
            response
          end
        end
      end
      # AIDEV-NOTE: Rails swallows Rollback; an absent result must never render a successful or committed response.
      raise CollaborationError.new("internal_error") unless result.is_a?(WriteResponse)
      deadline.check!
      result
    end

    def with_write_connection(deadline)
      pool = ActiveRecord::Base.connection_pool
      raise Tenancy::ContextError, "write cannot join an ambient transaction" if pool.active_connection?&.transaction_open?
      # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter?
      connection = nil
      handed_off = false
      # @type var disposition: disposition
      disposition = { started: false, detached: false }
      # @type var failures: Array[[String, Exception]]
      failures = []
      correlation = SecureRandom.uuid
      begin
        # AIDEV-NOTE: Ensure exists before checkout; deferred expiry cannot strand the returned adapter.
        connection = pool.checkout(deadline.remaining)
        deadline.check!
        result = yield(connection)
        raise CollaborationError.new("internal_error") unless result.is_a?(WriteResponse)
        deadline.check!
        connection.lock.synchronize do
          pool.synchronize do
            begin
              deadline.check!
              raise RequestDeadline::Expired if Thread.pending_interrupt?(RequestDeadline::Expired)
              unless pool.connections.include?(connection) &&
                  connection.owner.equal?(ActiveSupport::IsolatedExecutionState.context) && !connection.transaction_open?
                raise Tenancy::ContextError, "write connection ownership lost"
              end
              # AIDEV-NOTE: Membership, callbacks, queue insertion and handoff share Rails' adapter/pool lock order.
              pool.checkin(connection)
              unless pool.connections.include?(connection) && connection.owner.nil? && !connection.transaction_open?
                raise Tenancy::ContextError, "write checkin did not transfer a registered adapter"
              end
              # AIDEV-NOTE: Safe transfer precedes late expiry; expiry suppresses only the response, not the lease.
              handed_off = true
              deadline.check!
              raise RequestDeadline::Expired if Thread.pending_interrupt?(RequestDeadline::Expired)
            ensure
              # AIDEV-NOTE: Exceptions and throws quarantine before a waiter can lease a rejected checkin.
              primary = $!
              begin
                quarantine_connection(pool, connection, disposition, failures) unless handed_off
              ensure
                # AIDEV-NOTE: Removal may throw; restore a raised primary before outer detached-adapter disposal.
                raise primary if primary
              end
            end
          end
        end
        result
      ensure
        # AIDEV-NOTE: Native timeout or abnormal Ruby exit discards; never resurrect a Rails-removed adapter.
        discard_connection(pool, connection, correlation, $!, disposition, failures) if connection && !handed_off
      end
    end

    def discard_connection(pool, connection, correlation, primary, disposition, failures)
      connection.lock.synchronize do
        unless disposition[:started]
          pool.synchronize { quarantine_connection(pool, connection, disposition, failures) }
        end
        # AIDEV-NOTE: Proven detachment prevents a new lease; disconnect outside the monitor even after remove fails.
        if disposition[:detached]
          begin
            connection.disconnect!
          rescue Exception => error
            failures << ["disconnect", error]
          end
        end
      end
      failures.each do |phase, error|
        begin
          Rails.logger.error("protected_write_cleanup phase=#{phase} class=#{error.class.name} correlation=#{correlation}")
        rescue Exception
          # AIDEV-NOTE: A failed logging sink must not replace the request's primary exception or expose SQL details.
          raise primary if primary
          raise CollaborationError.new("temporarily_unavailable", retry_after: 1)
        end
      end
      raise CollaborationError.new("temporarily_unavailable", retry_after: 1) if !primary && !failures.empty?
    end

    # AIDEV-NOTE: Caller holds adapter then pool locks; owner validation and one removal cannot race a queue lease.
    def quarantine_connection(pool, connection, disposition, failures)
      disposition[:started] = true
      owner = connection.owner
      if owner && !owner.equal?(ActiveSupport::IsolatedExecutionState.context)
        failures << ["ownership", Tenancy::ContextError.new("write connection owned elsewhere")]
        return
      end
      removal_completed = false
      begin
        # AIDEV-NOTE: Outer monitor deliberately spans Rails replacement I/O; cleanup has no absolute deadline.
        pool.remove(connection)
        removal_completed = true
      rescue Exception => error
        failures << ["remove", error]
        removal_completed = true
      ensure
        # AIDEV-NOTE: A nonlocal removal exit bypasses rescue; record only a fixed, payload-free cleanup failure.
        unless removal_completed
          failures << ["remove", Tenancy::ContextError.new("write pool removal exited nonlocally")]
        end
        owner = connection.owner
        if owner && !owner.equal?(ActiveSupport::IsolatedExecutionState.context)
          failures << ["ownership", Tenancy::ContextError.new("write connection owned elsewhere")]
        else
          disposition[:detached] = detached_from_pool?(pool, connection)
        end
        unless disposition[:detached]
          failures << ["disposition", Tenancy::ContextError.new("write pool disposition unresolved")]
        end
      end
    rescue Exception => error
      # AIDEV-NOTE: Unknown queue/owner state is not detachment; preserve the primary and never retry removal.
      failures << ["inspection", error]
    end

    def detached_from_pool?(pool, connection)
      registered = pool.connections.include?(connection)
      # AIDEV-NOTE: Rails 8.1.4 Queue has no public membership query; this pinned seam is read-only under its monitor.
      available = pool.instance_variable_get(:@available)
      unless available.is_a?(ActiveRecord::ConnectionAdapters::ConnectionPool::Queue)
        raise Tenancy::ContextError, "write pool queue unavailable"
      end
      queued = available.instance_variable_get(:@queue)
      unless queued.is_a?(Array) && queued.all? { |entry| entry.is_a?(ActiveRecord::ConnectionAdapters::AbstractAdapter) }
        raise Tenancy::ContextError, "write pool queue shape invalid"
      end
      !registered && !queued.include?(connection)
    end

    def acquire(connection, identity, targets, deadline)
      # AIDEV-NOTE: PG ignores a shorter positive timeout if a timer is already armed; rearm before acquiring locks.
      connection.exec_query("SELECT set_config('transaction_timeout', '0', true)", "Reset write deadline", [])
      transaction_ms = [(deadline.remaining * 1000).floor, 1].max
      statement_ms = [(deadline.timeout(3.0) * 1000).floor, 1].max
      lock_ms = [(deadline.timeout(1.0) * 1000).floor, 1].max
      connection.exec_query("SELECT set_config('transaction_timeout', $1, true), " \
        "set_config('statement_timeout', $2, true), set_config('lock_timeout', $3, true)",
        "Protected write deadline", [bind(transaction_ms.to_s), bind(statement_ms.to_s), bind(lock_ms.to_s)])
      # UUID validation above makes the bound array literal safe; no caller value becomes SQL syntax.
      row = connection.exec_query(
        "SELECT app_auth.begin_protected_write($1::text, $2::uuid, $3::uuid, $4::uuid[]) AS result",
        "Protected write guard", [bind(identity.digest), bind(identity.user_id), bind(identity.auth_session_id),
          bind("{#{targets.join(',')}}")]).first
      deadline.check!
      metadata = row && row["result"]
      metadata = AuthInput.object(metadata, maximum: 16_384) if metadata.is_a?(String)
      raise CollaborationError.new("temporarily_unavailable") unless metadata.is_a?(Hash)
      metadata
    end

    def bind(value) = ActiveRecord::Relation::QueryAttribute.new("write_argument", value, ActiveRecord::Type::String.new)
  end
end
