# frozen_string_literal: true

require "json"
require "pg"
require "securerandom"
require "time"
require "minitest/autorun"

# AIDEV-NOTE: This isolated Docker harness holds fixture authority; production roles use separate actual logins.
class SessionDatabaseTestCase < Minitest::Test
  FIXTURE_LOCK = 0x42453032
  FUNCTIONS = %w[create_session resolve_session authorize_session touch_session list_organizations
                 switch_organization claim_refresh publish_refresh fail_refresh revoke_session
                 claim_revocations finish_revocation stage_entry claim_entry verify_entry fail_entry
                 complete_entry consume_entry_limits].freeze

  def setup
    @admin = connect("BE02_ADMIN_DATABASE_URL", "supabase_admin")
    # AIDEV-NOTE: The runner supplies an exclusive disposable DB; this lock rejects overlapping fixture owners.
    raise "database fixture already owned" unless @admin.exec_params("SELECT pg_try_advisory_lock($1::bigint)", [FIXTURE_LOCK]).getvalue(0, 0) == "t"
    %w[sessions revocation_intents pending_entries rate_limits].each do |table|
      raise "database fixture is not empty" unless @admin.exec("SELECT count(*) FROM app_auth.#{table}").getvalue(0, 0) == "0"
    end
    @api = connect("BE02_API_DATABASE_URL", "elevateo_api")
    @worker = connect("BE02_WORKER_DATABASE_URL", "elevateo_worker")
    @user, @auth, @org, @context = Array.new(4) { SecureRandom.uuid }
    @digest = SecureRandom.hex(32)
    @owned_entries = []
    @owned_buckets = []
    @admin.exec_params("INSERT INTO auth.users(id, email) VALUES ($1, $2)", [@user, "#{@user}@example.invalid"])
    @admin.exec_params("INSERT INTO auth.sessions(id, user_id, created_at) VALUES ($1, $2, clock_timestamp())", [@auth, @user])
    @admin.exec_params("INSERT INTO app.organizations(id, name) VALUES ($1, 'BE02 isolated fixture')", [@org])
    membership(present: true)
  end

  def teardown
    @api&.exec("ROLLBACK") if @api && @api.transaction_status != PG::PQTRANS_IDLE
    @worker&.exec("ROLLBACK") if @worker && @worker.transaction_status != PG::PQTRANS_IDLE
    if @admin && @user
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      @admin.exec_params("DELETE FROM app_auth.revocation_intents WHERE cookie_digest IN (SELECT cookie_digest FROM app_auth.sessions WHERE user_id = $1)", [@user])
      @admin.exec_params("DELETE FROM app_auth.sessions WHERE user_id = $1", [@user])
      (@owned_entries || []).each { |digest| @admin.exec_params("DELETE FROM app_auth.pending_entries WHERE digest = $1", [digest]) }
      (@owned_buckets || []).each { |digest| @admin.exec_params("DELETE FROM app_auth.rate_limits WHERE digest = $1", [digest]) }
      membership(present: false)
      @admin.exec_params("DELETE FROM app_auth.authorization_generations WHERE user_id = $1", [@user])
      @admin.exec_params("DELETE FROM app.organizations WHERE id = $1", [@org])
      @admin.exec_params("DELETE FROM auth.sessions WHERE user_id = $1", [@user])
      @admin.exec_params("DELETE FROM auth.users WHERE id = $1", [@user])
    end
  ensure
    close_connections([@api, @worker, @admin])
  end

  def connect(variable, expected_user)
    expected_database = ENV.fetch("BE02_TASK_DATABASE_NAME")
    raise "task database name is empty" if expected_database.empty?

    connection = PG.connect(ENV.fetch(variable))
    identity = connection.exec("SELECT session_user, current_database()").first
    raise "wrong fixture/runtime login" unless identity.fetch("session_user") == expected_user
    raise "wrong task database" unless identity.fetch("current_database") == expected_database

    connection.exec("SET statement_timeout = '3s'")
    connection.exec("SET lock_timeout = '1s'")
    initialized = true
    connection
  ensure
    close_connections([connection]) unless initialized
  end

  def close_connections(connections)
    failure = $!
    connections.compact.each do |connection|
      begin
        connection.close unless connection.finished?
      rescue StandardError => error
        failure ||= error
      end
    end
    raise failure if failure
  end

  def with_api_connections(count)
    connections = []
    count.times { connections << connect("BE02_API_DATABASE_URL", "elevateo_api") }
    yield connections
  ensure
    close_connections(connections)
  end

  # AIDEV-NOTE: Release every start gate and join every thread before closing handles, even after an assertion fails.
  def parallel_api_calls(count)
    with_api_connections(count) do |connections|
      start, threads = Queue.new, []
      begin
        connections.each_with_index do |connection, index|
          threads << Thread.new { start.pop; yield connection, index }
          threads.last.report_on_exception = false
        end
      ensure
        threads.length.times { start << true }
        failure = $!
        threads.each do |thread|
          begin
            thread.join
          rescue Exception => error # Minitest::Assertion is outside StandardError; re-raise after all joins.
            failure ||= error
          end
        end
        raise failure if failure
      end
      threads.map(&:value)
    end
  end

  def invoke(name, *values, connection: @api)
    raise ArgumentError, "unknown test function" unless FUNCTIONS.include?(name)
    assert_exclusive_queue! if name == "claim_revocations"

    placeholders = values.each_index.map { |index| "$#{index + 1}" }.join(", ")
    JSON.parse(connection.exec_params("SELECT app_auth.#{name}(#{placeholders})", values).getvalue(0, 0))
  end

  # AIDEV-NOTE: Claims also recover expired refreshes and rate buckets, so all mutable inputs must be fixture-owned.
  def assert_exclusive_queue!
    locked = @admin.exec_params(<<~SQL, [FIXTURE_LOCK]).getvalue(0, 0)
      SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()
        AND classid = 0 AND objid = $1::oid AND objsubid = 1 AND granted)
    SQL
    raise "database fixture ownership lost" unless locked == "t"

    foreign = @admin.exec_params(<<~SQL, [@user, JSON.generate(@owned_buckets)]).getvalue(0, 0)
      SELECT EXISTS (SELECT 1 FROM app_auth.sessions WHERE user_id IS DISTINCT FROM $1::uuid)
        OR EXISTS (SELECT 1 FROM app_auth.revocation_intents i LEFT JOIN app_auth.sessions s
          ON s.cookie_digest = i.cookie_digest WHERE s.user_id IS DISTINCT FROM $1::uuid)
        OR EXISTS (SELECT 1 FROM app_auth.rate_limits
          WHERE digest NOT IN (SELECT jsonb_array_elements_text($2::jsonb)))
    SQL
    raise "foreign database worker input" if foreign == "t"
  end

  def revocation_intent_id(digest: @digest, generation: 0, scope: "local")
    rows = @admin.exec_params(<<~SQL, [digest, generation, scope, @user])
      SELECT i.id FROM app_auth.revocation_intents i JOIN app_auth.sessions s USING (cookie_digest)
        WHERE i.cookie_digest = $1 AND i.credential_generation = $2 AND i.scope = $3 AND s.user_id = $4
    SQL
    assert_equal 1, rows.ntuples, "expected exactly one fixture intent"
    Integer(rows.getvalue(0, 0), 10)
  end

  def assert_claimed_intent(intents, id:, claim:, digest: @digest)
    matches = intents.select { |intent| intent.fetch("id") == id }
    assert_equal 1, matches.length, "claim must include the exact fixture intent"
    intent = matches.fetch(0)
    assert_equal claim, intent.fetch("claim_id")
    row = @admin.exec_params(<<~SQL, [id]).first
      SELECT i.cookie_digest, s.user_id, i.claim_id FROM app_auth.revocation_intents i
        JOIN app_auth.sessions s USING (cookie_digest) WHERE i.id = $1
    SQL
    assert_equal({ "cookie_digest" => digest, "user_id" => @user, "claim_id" => claim }, row)
    intent
  end

  def create(digest: @digest)
    invoke("create_session", digest, @user, @auth, "encrypted-access", "encrypted-refresh",
           (Time.now.utc + 3600).iso8601, @context, "c" * 48)
  end

  def authorize(context: @context, generation: nil)
    invoke("authorize_session", @digest, @user, @auth, context, generation)
  end

  def stage
    digest = SecureRandom.hex(32)
    @owned_entries << digest
    invoke("stage_entry", digest, "recovery", "encrypted-token-hash")
    digest
  end

  def expire_claim
    @admin.exec_params("UPDATE app_auth.sessions SET refresh_claim_deadline = clock_timestamp() - interval '1 second' WHERE cookie_digest = $1", [@digest])
  end

  def membership(present:)
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT cookie_digest FROM app_auth.sessions WHERE user_id = $1 ORDER BY cookie_digest FOR UPDATE", [@user])
    @admin.exec_params("SELECT app_auth.lock_authorization_generations($1, $2)", [@org, @user])
    if present
      @admin.exec_params("INSERT INTO app.organization_memberships(organization_id, user_id) VALUES ($1, $2)", [@org, @user])
    else
      @admin.exec_params("DELETE FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2", [@org, @user])
    end
    @admin.exec("COMMIT")
  rescue StandardError
    @admin.exec("ROLLBACK")
    raise
  end
end
