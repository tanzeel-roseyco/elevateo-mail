# frozen_string_literal: true

require_relative "test_helper"

class TenancyTest < RestrictedRoleTest
  A = Elevateo::Tenancy::Principal.new(user_id: "20000000-0000-0000-0000-000000000001",
                                     org_id: "10000000-0000-0000-0000-000000000001")
  A_OTHER = Elevateo::Tenancy::Principal.new(user_id: "20000000-0000-0000-0000-000000000002", org_id: A.org_id)
  B = Elevateo::Tenancy::Principal.new(user_id: "20000000-0000-0000-0000-000000000003",
                                     org_id: "10000000-0000-0000-0000-000000000002")
  FOREIGN = Elevateo::Tenancy::Principal.new(user_id: A.user_id, org_id: B.org_id)
  IDS_A = %w[30000000-0000-0000-0000-000000000001 30000000-0000-0000-0000-000000000002].freeze
  IDS_B = %w[30000000-0000-0000-0000-000000000003].freeze

  def rows(connection = @connection)
    connection.select_values("SELECT id FROM app.mailboxes ORDER BY id")
  end

  def with_principal(principal, connection = @connection, &block)
    Elevateo::Tenancy.with_context(principal, connection: connection, &block)
  end

  def assert_cleared(connection = @connection)
    %w[app.user_id app.org_id].each do |setting|
      assert_includes [nil, ""], connection.select_value("SELECT current_setting('#{setting}', true)")
    end
    assert_empty rows(connection)
  end

  def test_authorized_private_shared_and_foreign_reads
    assert_cleared
    with_principal(A) { assert_equal IDS_A, rows }
    with_principal(A_OTHER) { assert_equal IDS_A.first(1), rows }
    with_principal(B) { assert_equal IDS_B, rows }
    with_principal(FOREIGN) { assert_empty rows }
    assert_cleared
  end

  def test_claims_are_inside_the_real_transaction_and_do_not_survive_commit_or_exception
    with_principal(A) do |connection|
      assert connection.transaction_open?
      assert_equal A.user_id, connection.select_value("SELECT current_setting('app.user_id', true)")
      assert_equal A.org_id, connection.select_value("SELECT current_setting('app.org_id', true)")
      assert_equal IDS_A, rows
    end
    assert_cleared
    original = NoMethodError.new("synthetic caller failure with intact ownership")
    assert_same original, assert_raises(NoMethodError) { with_principal(B) { raise original } }
    assert_cleared
  end

  def test_explicit_rollback_returns_nil_and_cleans_claims_cache_and_marker
    ActiveRecord::Base.connection_pool.release_connection
    Rails.application.executor.wrap do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        assert connection.query_cache_enabled
        result = with_principal(A, connection) do
          assert_equal IDS_A, rows(connection)
          raise ActiveRecord::Rollback
        end
        assert_nil result
        refute connection.transaction_open?
        assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
        assert connection.query_cache_enabled
        assert_cleared(connection)
      end
    end
    ActiveRecord::Base.connection_pool.with_connection { |connection| assert_cleared(connection) }
  end

  def test_principal_uuid_strings_cannot_mutate_the_active_frame
    principal = Elevateo::Tenancy::Principal.new(user_id: A.user_id.dup, org_id: A.org_id.dup)
    with_principal(principal) do
      assert_raises(FrozenError) { principal.user_id.replace(B.user_id) }
      assert_raises(FrozenError) { principal.org_id.replace(B.org_id) }
      assert_raises(Elevateo::Tenancy::ContextError) { with_principal(B) { flunk "changed principal yielded" } }
      assert_equal A.user_id, @connection.select_value("SELECT current_setting('app.user_id', true)")
      assert_equal A.org_id, @connection.select_value("SELECT current_setting('app.org_id', true)")
      assert_equal IDS_A, rows
    end
    assert_cleared
  end

  def test_unrelated_transaction_is_rejected_before_claims
    @connection.transaction do
      @connection.select_value("SELECT 1")
      assert_raises(Elevateo::Tenancy::ContextError) { with_principal(A) { flunk "unrelated transaction yielded" } }
      assert_cleared
    end
  end

  def test_invalid_principal_never_yields_or_sets_claims
    [nil, {}, "principal"].each do |value|
      assert_raises(Elevateo::Tenancy::ContextError) { with_principal(value) { flunk "invalid principal yielded" } }
    end
    assert_raises(Elevateo::Tenancy::ContextError) { Elevateo::Tenancy::Principal.new(user_id: nil, org_id: A.org_id) }
    assert_cleared
  end

  def test_nested_context_preserves_outer_authority_after_rejected_entry
    with_principal(A) do
      with_principal(A) { assert_equal IDS_A, rows }
      assert_raises(Elevateo::Tenancy::ContextError) { with_principal(B) { flunk "conflicting principal yielded" } }
      @connection.transaction(requires_new: true) do
        assert_raises(Elevateo::Tenancy::ContextError) { with_principal(A) { flunk "different savepoint yielded" } }
        assert_equal IDS_A, rows
      end
      with_principal(A) { assert_equal IDS_A, rows }
    end
    assert_cleared
  end

  def test_wrong_connection_cannot_reuse_outer_marker
    # A separate pool avoids deadlocking this regression when the primary pool size is one.
    separate = Class.new(ActiveRecord::Base) { self.abstract_class = true }
    self.class.const_set(:SeparateConnection, separate)
    separate.establish_connection(ActiveRecord::Base.connection_db_config.configuration_hash.merge(pool: 1, checkout_timeout: 5))
    separate.connection_pool.with_connection do |other|
      with_principal(A) do
        assert_raises(Elevateo::Tenancy::ContextError) { with_principal(A, other) { flunk "wrong connection yielded" } }
        assert_cleared(other)
        assert_equal IDS_A, rows
      end
    end
  ensure
    separate&.connection_pool&.disconnect!
    self.class.send(:remove_const, :SeparateConnection) if self.class.const_defined?(:SeparateConnection, false)
  end

  def test_executor_query_cache_does_not_reuse_rows_across_principals
    ActiveRecord::Base.connection_pool.release_connection
    Rails.application.executor.wrap do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        assert connection.query_cache_enabled
        hits = []
        subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*args|
          payload = args.last
          hits << payload if payload[:connection].equal?(connection) && payload[:sql].include?("r1_cache_control")
        end
        begin
          2.times { connection.select_value("SELECT 424242 AS r1_cache_control") }
          assert hits.any? { |event| event[:cached] }, "executor never produced a real cache hit"
        ensure
          ActiveSupport::Notifications.unsubscribe(subscriber)
        end
        bind = ActiveRecord::Relation::QueryAttribute.new("visibility", "shared", ActiveRecord::Type::String.new)
        query = -> { connection.select_values("SELECT id FROM app.mailboxes WHERE visibility = $1 ORDER BY id", "R1", [bind]) }
        assert_empty query.call
        with_principal(A, connection) { 2.times { assert_equal IDS_A.first(1), query.call } }
        with_principal(B, connection) { 2.times { assert_equal IDS_B, query.call } }
        assert_raises(RuntimeError) do
          with_principal(A, connection) do
            refute connection.query_cache_enabled
            assert_equal IDS_A.first(1), query.call
            raise "synthetic cache failure"
          end
        end
        assert_empty query.call
        assert connection.query_cache_enabled
      end
    end
    ActiveRecord::Base.connection_pool.with_connection { |connection| assert_cleared(connection) }
  end

  def test_malformed_claims_fail_and_pool_reuse_has_no_effective_authority
    @connection.transaction do
      @connection.execute("SELECT set_config('app.user_id', 'malformed', true), set_config('app.org_id', '#{A.org_id}', true)")
      assert_raises(ActiveRecord::StatementInvalid) { rows }
      raise ActiveRecord::Rollback
    end
    assert_cleared
    with_principal(A) { assert_equal IDS_A, rows }
    ActiveRecord::Base.connection_pool.release_connection
    ActiveRecord::Base.connection_pool.with_connection { |connection| assert_cleared(connection) }
  end

  # AIDEV-NOTE: Exercise ended/replaced frames on every exit path; session claims prove physical disposal is needed.
  def test_ended_or_replaced_owned_transaction_is_rejected_and_cleaned
    [:commit_transaction, :rollback_transaction].product([0, 1, 2], [:normal, :error, :rollback, :throw]).each do |ending, depth, exit_mode|
      backend = @connection.select_value("SELECT pg_backend_pid()")
      error = assert_raises(Elevateo::Tenancy::ContextError) do
        catch(:caller_exit) do
          with_principal(A) do |connection|
            connection.public_send(ending)
            depth.times { connection.begin_transaction }
            connection.execute("SELECT set_config('app.user_id', '#{A.user_id}', false), set_config('app.org_id', '#{A.org_id}', false)")
            assert_raises(Elevateo::Tenancy::ContextError) do
              with_principal(A, connection) { flunk "ended/replaced frame yielded" }
            end
            case exit_mode
            when :error then raise "synthetic caller failure after ownership loss"
            when :rollback then raise ActiveRecord::Rollback
            when :throw then throw :caller_exit
            end
          end
        end
      end
      assert_equal "owned tenant transaction ended or changed", error.message
      refute @connection.connected?, "untrusted physical session was retained"
      refute @connection.transaction_open?
      assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
      assert_cleared
      refute_equal backend, @connection.select_value("SELECT pg_backend_pid()")
      with_principal(B) { assert_equal IDS_B, rows }
      ActiveRecord::Base.connection_pool.release_connection
      @connection = ActiveRecord::Base.connection
      assert_cleared
    end
  end

  def test_small_concurrent_pool_does_not_cross_principals
    ActiveRecord::Base.connection_pool.release_connection
    failures = Queue.new
    threads = [A, B, A_OTHER, FOREIGN].map do |principal|
      Thread.new do
        Rails.application.executor.wrap do
          ActiveRecord::Base.connection_pool.with_connection do |connection|
            expected = { A => IDS_A, B => IDS_B, A_OTHER => IDS_A.first(1), FOREIGN => [] }.fetch(principal)
            3.times { with_principal(principal, connection) { raise "cross-principal rows" unless rows(connection) == expected } }
            raise "authority survived pool use" unless rows(connection).empty?
          end
        end
      rescue StandardError => error
        failures << error
      end
    end
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 20
    threads.each do |thread|
      remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
      assert remaining.positive? && thread.join(remaining), "concurrent read exceeded 20-second bound"
    end
    assert failures.empty?, "concurrent restricted-role read failed"
    ActiveRecord::Base.connection_pool.with_connection { |connection| assert_cleared(connection) }
  ensure
    # Kill only this test's threads if its bounded wait fails; do not leave pool holders running into later tests.
    threads&.each { |thread| thread.kill if thread.alive? }
    threads&.each { |thread| thread.join(1) }
  end
end
