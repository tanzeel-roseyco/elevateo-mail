# frozen_string_literal: true

# AIDEV-NOTE: Each scenario unwinds its own transactions; setup failures never count as defect reproduction.
module R1BaselineScenarios
  def t1(connection)
    evidence = {}
    connection.transaction do
      connection.select_value("SELECT 1") # Materialize the ambient transaction before entering the wrapper.
      guard!(empty_claims?(claims(connection)), "ambient context was not empty")
      yielded = false
      rejected = false
      begin
        context(self.class::A, connection) do
          yielded = true
          guard!(claims(connection) == [self.class::A.user_id, self.class::A.org_id], "T1 claims not established")
          connection.uncached { guard!(rows(connection) == self.class::IDS_A, "T1 positive read failed") }
        end
      rescue Elevateo::Tenancy::ContextError
        rejected = true
      end
      outside = connection.uncached { rows(connection) }
      evidence = { yielded: yielded, rejected: rejected, claims: claims(connection), outside: outside }
      if @mode == "repair"
        repair!(rejected && !yielded && empty_claims?(evidence[:claims]) && outside.empty?, "T1 ambient escape")
      end
      raise ActiveRecord::Rollback
    end
    [evidence, evidence[:yielded] && evidence[:claims] == [self.class::A.user_id, self.class::A.org_id] &&
      evidence[:outside] == self.class::IDS_A]
  end

  def t2(connection)
    separate = Class.new(ActiveRecord::Base) { self.abstract_class = true }
    self.class.const_set(:OtherDatabase, separate)
    separate.establish_connection(ActiveRecord::Base.connection_db_config.configuration_hash.merge(pool: 1, checkout_timeout: 5))
    evidence = {}
    separate.connection_pool.with_connection do |other|
      guard!(!other.equal?(connection), "T2 requires distinct checked-out connections")
      guard_authority(other, @mode)
      other.transaction do
        binds = [self.class::B.user_id, self.class::B.org_id].map do |value|
          ActiveRecord::Relation::QueryAttribute.new("uuid", value, ActiveRecord::Type::String.new)
        end
        other.exec_query("SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)", "T2 stimulus", binds)
        context(self.class::A, connection) do
          yielded = false
          rejected = false
          begin
            context(self.class::A, other) { yielded = true }
          rescue Elevateo::Tenancy::ContextError
            rejected = true
          end
          guard!(claims(connection) == [self.class::A.user_id, self.class::A.org_id], "T2 outer claims changed")
          guard!(claims(other) == [self.class::B.user_id, self.class::B.org_id], "T2 independent claims changed")
          a_rows = connection.uncached { rows(connection) }
          b_rows = other.uncached { rows(other) }
          guard!(a_rows == self.class::IDS_A && b_rows == self.class::IDS_B, "T2 positive fixture reads failed")
          evidence = { yielded: yielded, rejected: rejected, a_rows: a_rows, b_rows: b_rows }
          if @mode == "repair"
            repair!(rejected && !yielded, "T2 different connection accepted")
            context(self.class::A, connection) { repair!(rows(connection) == self.class::IDS_A, "same frame nesting failed") }
          end
        end
        raise ActiveRecord::Rollback
      end
      guard!(empty_claims?(claims(other)), "T2 other connection retained claims")
      # AIDEV-NOTE: A clean second connection isolates frame identity rejection from the ambient-transaction guard.
      guard!(!other.transaction_open? && empty_claims?(claims(other)), "T2 clean connection not clean")
      context(self.class::A, connection) do
        before = [claims(connection), claims(other)]
        yielded = false
        rejected = false
        begin
          context(self.class::A, other) { yielded = true }
        rescue Elevateo::Tenancy::ContextError
          rejected = true
        end
        guard!([claims(connection), claims(other)] == before, "T2 clean attempt changed claims")
        evidence[:clean] = { yielded: yielded, rejected: rejected }
        repair!(rejected && !yielded, "T2 clean different connection accepted") if @mode == "repair"
      end
    end
    [evidence, evidence[:yielded] && evidence[:b_rows] == self.class::IDS_B]
  ensure
    separate&.connection_pool&.disconnect!
    self.class.send(:remove_const, :OtherDatabase) if self.class.const_defined?(:OtherDatabase, false)
  end

  def t3(connection)
    guard!(connection.query_cache_enabled, "T3 executor query cache inactive")
    events = []
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*args|
      payload = args.last
      events << { sql: payload[:sql], cached: payload[:cached] == true } if payload[:connection].equal?(connection)
    end
    2.times { connection.select_value("SELECT 424242 AS r1_cache_control") }
    guard!(events.any? { |event| event[:sql].include?("r1_cache_control") && event[:cached] }, "T3 cache positive control failed")
    connection.clear_query_cache
    events.clear
    query = "SELECT id FROM app.mailboxes WHERE visibility = $1 ORDER BY id"
    bind = ActiveRecord::Relation::QueryAttribute.new("visibility", "shared", ActiveRecord::Type::String.new)
    read = -> { connection.select_values(query, "R1 cache observation", [bind]) }
    observed = []
    states = []
    pid = connection.raw_connection.backend_pid
    [self.class::A, self.class::B].each do |principal|
      context(principal, connection) do
        repair!(!connection.query_cache_enabled, "T3 wrapper cache remains enabled") if @mode == "repair"
        states << claims(connection)
        guard!(states.last == [principal.user_id, principal.org_id], "T3 claims not established")
        observed << read.call
      end
    end
    states << claims(connection)
    observed << read.call
    guard!(connection.raw_connection.backend_pid == pid && empty_claims?(states.last), "T3 connection/context changed")
    guard!(observed.first == self.class::IDS_A.first(1), "T3 positive authorized read failed")
    cached = events.select { |event| event[:sql] == query }.map { |event| event[:cached] }
    guard!(cached.length == 3, "T3 did not observe all three ActiveRecord query events")
    expected = [self.class::IDS_A.first(1), self.class::IDS_B, []]
    repair!(observed == expected && connection.query_cache_enabled, "T3 cache crossed tenant boundary") if @mode == "repair"
    [{ rows: observed, claims: states, cached: cached }, observed != expected && cached.include?(true)]
  ensure
    ActiveSupport::Notifications.unsubscribe(subscriber) if subscriber
  end
end
