# frozen_string_literal: true

require "active_record"
require_relative "database_test_helper"
require_relative "../../lib/elevateo/thread_read_state"
require_relative "../../lib/elevateo/thread_assignment"
require_relative "../../lib/elevateo/thread_notes"
require_relative "../../lib/elevateo/thread_reads"
require_relative "../../lib/elevateo/tenancy"

class CollaborationApiRecord < ActiveRecord::Base
  self.abstract_class = true
end

# AIDEV-NOTE: Only setup/teardown use admin; services execute against actual API RLS with real protected-write guards.
class CollaborationDatabaseCase < SessionDatabaseTestCase
  Identity = Struct.new(:user_id, :org_id, :digest, :auth_session_id, keyword_init: true)

  def setup
    super
    @actors, @foreign_orgs = [], []
    CollaborationApiRecord.establish_connection(ENV.fetch("BE02_API_DATABASE_URL"))
    @identity = Identity.new(user_id: @user, org_id: @org, digest: @digest, auth_session_id: @auth)
    @box = mailbox
    @thread = conversation
    @envelope = { "context_id" => "context_A_0123456789", "authorization_version" => "authz_A_0123456789" }
    @cursors = Elevateo::Cursors.new(secret: "disposable-collaboration-key-0001")
    assert_equal "ok", create.fetch("status")
  end

  def teardown
    CollaborationApiRecord.remove_connection
    if @admin
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      (@actors || []).each do |actor|
        @admin.exec_params("DELETE FROM app_auth.sessions WHERE user_id = $1", [actor.user_id])
        member_change(actor.user_id) do |connection|
          connection.exec_params("DELETE FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2", [@org, actor.user_id])
        end
        @admin.exec_params("DELETE FROM app_auth.authorization_generations WHERE user_id = $1", [actor.user_id])
        @admin.exec_params("DELETE FROM auth.sessions WHERE user_id = $1", [actor.user_id])
        @admin.exec_params("DELETE FROM auth.users WHERE id = $1", [actor.user_id])
      end
      (@foreign_orgs || []).each do |org|
        fixture_change(org) { @admin.exec_params("DELETE FROM app.organizations WHERE id = $1", [org]) }
      end
    end
    super
  end

  def mailbox(org: @org, visibility: "shared")
    id = SecureRandom.uuid
    fixture_change(org) do
      @admin.exec_params("INSERT INTO app.mailboxes(id, organization_id, address, visibility) VALUES ($1, $2, $3, $4)",
        [id, org, "#{id}@example.invalid", visibility])
    end
    id
  end

  # AIDEV-NOTE: Mailbox creation changes every reader's authority; fixtures obey the production generation guards.
  def fixture_change(org)
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT cookie_digest FROM app_auth.sessions WHERE organization_id = $1 ORDER BY cookie_digest FOR UPDATE", [org])
    @admin.exec_params("SELECT app_auth.lock_authorization_generations($1, NULL)", [org])
    yield
    @admin.exec("COMMIT")
  rescue Exception
    @admin.exec("ROLLBACK")
    raise
  end

  def conversation(box: @box, org: @org)
    id = SecureRandom.uuid
    @admin.exec_params("INSERT INTO app.threads(id, organization_id, mailbox_id) VALUES ($1, $2, $3)", [id, org, box])
    id
  end

  def add_actor
    actor = Identity.new(user_id: SecureRandom.uuid, org_id: @org, digest: SecureRandom.hex(32), auth_session_id: SecureRandom.uuid)
    @actors << actor
    @admin.exec_params("INSERT INTO auth.users(id, email) VALUES ($1, $2)", [actor.user_id, "#{actor.user_id}@example.invalid"])
    @admin.exec_params("INSERT INTO auth.sessions(id, user_id, created_at) VALUES ($1, $2, clock_timestamp())", [actor.auth_session_id, actor.user_id])
    member_change(actor.user_id) do |connection|
      connection.exec_params("INSERT INTO app.organization_memberships(organization_id, user_id) VALUES ($1, $2)", [@org, actor.user_id])
    end
    result = invoke("create_session", actor.digest, actor.user_id, actor.auth_session_id, "encrypted-access",
      "encrypted-refresh", (Time.now.utc + 3600).iso8601, SecureRandom.uuid, "c" * 48)
    assert_equal "ok", result.fetch("status")
    actor
  end

  def member_change(user, connection: @admin)
    connection.exec("BEGIN")
    connection.exec_params("SELECT cookie_digest FROM app_auth.sessions WHERE user_id = $1 ORDER BY cookie_digest FOR UPDATE", [user])
    connection.exec_params("SELECT app_auth.lock_authorization_generations($1, $2)", [@org, user])
    yield connection
    connection.exec("COMMIT")
  rescue Exception
    connection.exec("ROLLBACK")
    raise
  end

  def private_member(box, actor)
    member_change(actor.user_id) do |connection|
      connection.exec_params("INSERT INTO app.mailbox_memberships(organization_id, mailbox_id, user_id) VALUES ($1, $2, $3)", [@org, box, actor.user_id])
    end
  end

  def scope(identity: @identity, targets: [], write: true)
    CollaborationApiRecord.connection_pool.with_connection do |connection|
      principal = Elevateo::Tenancy::Principal.new(user_id: identity.user_id, org_id: identity.org_id)
      Elevateo::Tenancy.with_context(principal, connection: connection, read_only: !write) do
        connection.execute("SET LOCAL statement_timeout = '3s'")
        connection.execute("SET LOCAL lock_timeout = '2s'")
        if write
          values = [identity.digest, identity.user_id, identity.auth_session_id, "{#{targets.join(',')}}"]
          binds = values.map { |v| ActiveRecord::Relation::QueryAttribute.new("fixture", v, ActiveRecord::Type::String.new) }
          row = connection.exec_query("SELECT app_auth.begin_protected_write($1::text, $2::uuid, $3::uuid, $4::uuid[]) AS result", "Guard fixture", binds).first
          metadata = row.fetch("result")
          metadata = JSON.parse(metadata) if metadata.is_a?(String)
          assert_equal "ok", metadata.fetch("status")
        end
        yield connection
      end
    end
  end

  def service(type, connection, identity: @identity)
    options = { connection: connection, identity: identity, session: @envelope }
    options[:cursors] = @cursors if [Elevateo::ThreadNotes, Elevateo::ThreadReads].include?(type)
    type.new(**options)
  end

  def state(read, thread: @thread, box: @box, identity: @identity)
    scope(identity: identity) do |connection|
      service(Elevateo::ThreadReadState, connection, identity: identity).put(thread_id: thread, input: { "mailbox_id" => box, "read" => read })
    end
  end

  def assignment(target, expected, thread: @thread, box: @box, identity: @identity)
    scope(identity: identity, targets: [target].compact) do |connection|
      service(Elevateo::ThreadAssignment, connection, identity: identity).put(thread_id: thread,
        input: { "mailbox_id" => box, "assignee_id" => target, "expected_assignment_version" => expected })
    end
  end

  def note(id, body: "exact text", thread: @thread, box: @box, identity: @identity)
    scope(identity: identity) do |connection|
      service(Elevateo::ThreadNotes, connection, identity: identity).post(thread_id: thread,
        input: { "mailbox_id" => box, "note_id" => id, "body_text" => body })
    end
  end

  def parallel_services(count)
    start = Queue.new
    threads = Array.new(count) do |index|
      Thread.new do
        start.pop
        yield index
      rescue Elevateo::CollaborationError => error
        error
      end.tap { |thread| thread.report_on_exception = false }
    end
    count.times { start << true }
    failure = nil
    threads.each do |thread|
      thread.join
    rescue Exception => error
      failure ||= error
    end
    raise failure if failure
    threads.map(&:value)
  end

  # AIDEV-NOTE: Scoped admin observations must never count or mutate another test's tenant fixtures.
  def owned_rows(table, box: @box, thread: @thread, user: nil)
    sql = "SELECT * FROM app.#{table} WHERE organization_id = $1 AND mailbox_id = $2 AND thread_id = $3"
    values = [@org, box, thread]
    sql += " AND user_id = $4" if user
    values << user if user
    @admin.exec_params(sql, values).to_a
  end

  def foreign_witness
    org = SecureRandom.uuid
    @foreign_orgs << org
    @admin.exec_params("INSERT INTO app.organizations(id, name) VALUES ($1, 'isolation witness')", [org])
    fixture_change(org) do
      @admin.exec_params("INSERT INTO app.organization_memberships(organization_id, user_id) VALUES ($1, $2)", [org, @user])
    end
    box = mailbox(org: org)
    thread = conversation(org: org, box: box)
    @admin.exec_params("INSERT INTO app.thread_read_states(organization_id, mailbox_id, thread_id, user_id, is_read) VALUES ($1, $2, $3, $4, true)", [org, box, thread, @user])
    @admin.exec_params("INSERT INTO app.thread_assignments(organization_id, mailbox_id, thread_id, assignee_id, assignment_version, updated_at) VALUES ($1, $2, $3, $4, 7, clock_timestamp())", [org, box, thread, @user])
    [org, box, thread]
  end

  def witness_rows(ids)
    %w[thread_read_states thread_assignments].map do |table|
      @admin.exec_params("SELECT * FROM app.#{table} WHERE organization_id = $1 AND mailbox_id = $2 AND thread_id = $3", ids).to_a
    end
  end

  def assert_state_fields(json, fields, expected)
    body = JSON.parse(json)
    assert_equal (%w[context_id authorization_version thread_id mailbox_id] + fields).sort, body.keys.sort
    assert_equal expected, fields.map { |field| body.fetch(field) }
    body
  end

  def wait_for_lock(pid, blocker:)
    refute_equal blocker, pid
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 1.5
    loop do
      row = @admin.exec_params("SELECT $2::integer = ANY(pg_blocking_pids($1::integer)) AS intended_blocker", [pid, blocker]).first
      return if row && row.fetch("intended_blocker") == "t"
      raise "expected waiter #{pid} blocked by #{blocker}" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      sleep 0.01
    end
  end
end
