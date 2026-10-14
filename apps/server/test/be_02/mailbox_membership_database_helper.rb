# frozen_string_literal: true

require_relative "collaboration_database_helper"
require_relative "../../lib/elevateo/mailbox_memberships"
require_relative "../../lib/elevateo/mail_search"
require_relative "../../lib/elevateo/session_crypto"

# AIDEV-NOTE: Reuse the actual-login C harness; D adds only membership fixtures and scoped service entry points.
class MailboxMembershipDatabaseCase < CollaborationDatabaseCase
  Key = Struct.new(:session_key)
  FLAGS = { "compose" => true, "approve_send" => false, "manage_members" => false }.freeze

  def setup
    @owned_boxes = []
    super
    @presentation = Elevateo::SessionPresentation.new(crypto: Elevateo::SessionCrypto.new(config: Key.new("d" * 32)))
    explicit_member(@identity, manager: true)
  end

  def teardown
    if @admin
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      # Revision exhaustion is test data, and must not prevent fixture-owned cascades during teardown.
      (@owned_boxes || []).each do |box|
        @admin.exec_params("UPDATE app.mailbox_membership_revisions SET membership_version = 0 WHERE mailbox_id = $1", [box])
      end
    end
    super
  end

  def mailbox(org: @org, visibility: "shared")
    super(org: org, visibility: visibility).tap { |id| @owned_boxes << id }
  end

  def explicit_member(actor, box: @box, manager: false)
    member_change(actor.user_id) do |connection|
      connection.exec_params(<<~SQL, [@org, box, actor.user_id, manager])
        INSERT INTO app.mailbox_memberships(organization_id, mailbox_id, user_id, compose, manage_members)
          VALUES ($1,$2,$3,true,$4)
      SQL
    end
  end

  def revision(box = @box)
    Integer(@admin.exec_params("SELECT membership_version FROM app.mailbox_membership_revisions WHERE mailbox_id = $1", [box]).getvalue(0, 0), 10)
  end

  def generation(user = @user)
    Integer(@admin.exec_params("SELECT generation FROM app_auth.authorization_generations WHERE organization_id = $1 AND user_id = $2", [@org, user]).getvalue(0, 0), 10)
  end

  def raw_change(target, expected, flags: FLAGS, identity: @identity, box: @box, before_change: nil)
    result = nil
    scope(identity: identity, targets: [target]) do |connection|
      before_change&.call(connection)
      result = membership_query(connection, identity, box, target, expected, flags)
      raise ActiveRecord::Rollback unless result.fetch("status") == "ok"
    end
    result
  end

  def membership_query(connection, identity, box, target, expected, flags)
    values = [identity.digest, box, target, expected.to_s, flags.nil?.to_s,
              *Elevateo::MailboxMembershipInput::FLAGS.map { |key| flags && flags.fetch(key).to_s }]
    binds = values.map { |value| ActiveRecord::Relation::QueryAttribute.new("fixture", value, ActiveRecord::Type::String.new) }
    result = connection.exec_query(Elevateo::MailboxMemberships::CHANGE_SQL, "Membership fixture", binds).first.fetch("result")
    result.is_a?(String) ? JSON.parse(result) : result
  end

  # AIDEV-NOTE: Fixed user IDs make reversed guard order reproducible; session IDs and cookies remain disposable.
  def membership_fixed_actor(user_id)
    actor = Identity.new(user_id: user_id, org_id: @org, digest: SecureRandom.hex(32), auth_session_id: SecureRandom.uuid)
    @actors << actor
    @admin.exec_params("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [user_id, "#{user_id}@example.invalid"])
    @admin.exec_params("INSERT INTO auth.sessions(id,user_id,created_at) VALUES ($1,$2,clock_timestamp())", [actor.auth_session_id, user_id])
    member_change(user_id) do |connection|
      connection.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [@org, user_id])
    end
    result = invoke("create_session", actor.digest, user_id, actor.auth_session_id, "encrypted-access",
      "encrypted-refresh", (Time.now.utc + 3600).iso8601, SecureRandom.uuid, "c" * 48)
    assert_equal "ok", result.fetch("status")
    actor
  end

  # AIDEV-NOTE: The holder must unwind before this helper cleans up workers; one deadline covers all race phases.
  def membership_race(seconds: 1.5)
    workers = []
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + seconds
    yield workers, deadline - 0.25
  ensure
    original = $!
    cleanup_error = nil
    (workers || []).each do |worker|
      begin
        unless worker.join([deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC) - 0.1, 0].max)
          worker.kill
          worker.join([deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC), 0].max)
          cleanup_error ||= RuntimeError.new("membership worker exceeded shared deadline")
        end
      rescue StandardError, Minitest::Assertion => error
        cleanup_error ||= error
      end
    end
    raise cleanup_error if cleanup_error && !original
  end

  def membership_worker(workers, before_pid: nil, &operation)
    ready = Queue.new
    worker = Thread.new do
      Thread.current.report_on_exception = false
      begin
        before_pid&.call
        CollaborationApiRecord.connection_pool.with_connection do |connection|
          ready << [:pid, connection.select_value("SELECT pg_backend_pid()")]
          operation.call
        end
      rescue StandardError, Minitest::Assertion => error
        ready << [:error, error]
        raise
      end
    end
    worker.report_on_exception = false
    workers << worker
    [worker, ready]
  end

  def membership_pid(worker, ready, deadline)
    loop do
      unless ready.empty?
        kind, value = ready.pop(true)
        raise value if kind == :error
        return value
      end
      worker.value unless worker.alive?
      membership_tick(deadline, "worker did not publish a PID")
    end
  end

  def membership_result(worker, deadline)
    remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
    raise "membership worker exceeded shared deadline" unless worker.join([remaining, 0].max)
    worker.value
  end

  def membership_tick(deadline, message)
    remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
    raise message unless remaining.positive?
    sleep [remaining, 0.005].min
  end

  # AIDEV-NOTE: Query identity and blocker distinguish generation waits from later mailbox business-lock waits.
  def membership_lock_wait(worker, pid, blocker, routine, deadline)
    loop do
      worker.value unless worker.alive?
      @admin.exec("SELECT pg_stat_clear_snapshot()")
      row = @admin.exec_params(<<~SQL, [pid, "{#{Array(blocker).join(',')}}", "%#{routine}%"]).first
        SELECT wait_event_type = 'Lock' AND pg_blocking_pids(pid) && $2::integer[]
          AND query LIKE $3 AS expected_wait FROM pg_stat_activity WHERE pid = $1
      SQL
      return if row && row.fetch("expected_wait") == "t"
      membership_tick(deadline, "worker never reached #{routine} lock held by #{blocker}")
    end
  end

  def reader(type, connection, identity: @identity)
    type.new(connection: connection, identity: identity, session: @envelope, cursors: @cursors)
  end

  def roster(query: {}, box: @box, identity: @identity)
    scope(identity: identity, write: false) do |connection|
      JSON.parse(reader(Elevateo::MailboxMemberships, connection, identity: identity).list(mailbox_id: box, query: query))
    end
  end

  def search(query = {})
    scope(write: false) do |connection|
      JSON.parse(reader(Elevateo::MailSearch, connection).search(query: { "q" => "needle" }.merge(query)))
    end
  end

  def fixture_message(thread: @thread, box: @box, org: @org, body: "", sender: nil, recipients: [], sent: nil)
    id = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [id, org, box, thread, body, sender && JSON.generate(sender), JSON.generate(recipients), sent])
      INSERT INTO app.messages(id, organization_id, mailbox_id, thread_id, body_text, sender, recipients, sent_at)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
    SQL
    id
  end
end
