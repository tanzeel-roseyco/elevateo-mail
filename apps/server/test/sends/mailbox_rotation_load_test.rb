# frozen_string_literal: true

require_relative "mailbox_rotation_helper"

# AIDEV-NOTE: Bulk rows exercise selection cost only; real approval and transport are covered by separate suites.
class MailboxRotationLoadTest < MailboxRotationTestCase
  def test_712_mailboxes_with_uneven_backlog_history_and_eight_selectors
    template = enqueue
    fixture_change do
      # AIDEV-NOTE: Bulk seeding and statistics get 90s; worker queries retain 3s statement/1s lock limits.
      @admin.exec("SET LOCAL statement_timeout='90s'")
      @admin.exec_params("SELECT set_config('test.rotation_template',$1,true)", [template])
      @admin.exec(File.read(File.join(__dir__, "mailbox_rotation_load.sql")))
      @admin.exec("ANALYZE app_send_private.intents; ANALYZE app_send_private.jobs; ANALYZE app_send_private.mailbox_policy")
    end
    boxes = @admin.exec_params("SELECT send_id,mailbox_id FROM app_send_private.intents WHERE organization_id=$1", [@org])
      .to_h { |row| [row.fetch("send_id"), row.fetch("mailbox_id")] }
    active = @admin.exec_params("SELECT count(*) FROM app_send_private.jobs j JOIN app_send_private.intents i USING(send_id) WHERE i.organization_id=$1 AND j.state='queued'", [@org]).getvalue(0, 0)
    assert_equal "1711", active
    selected, elapsed = [], []
    712.times do
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      id = due
      elapsed << Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
      refute_nil id
      selected << boxes.fetch(id)
      @admin.exec_params("UPDATE app_send_private.jobs SET state='cancelled',next_action='none',next_check_at=NULL WHERE send_id=$1", [id])
    end
    assert_equal 712, selected.uniq.length, "a mailbox backlog starved another mailbox"
    assert_equal @box, selected.first, "the deliberately older backlog should win the first tie"
    assert_equal 999, @admin.exec_params("SELECT count(*) FROM app_send_private.jobs j JOIN app_send_private.intents i USING(send_id) WHERE i.organization_id=$1 AND j.state='queued'", [@org]).getvalue(0, 0).to_i
    concurrent = concurrent_selections
    puts JSON.generate(event: "mail1022_selector_load", mailboxes: 712, initial_active: 1711,
      terminal_history: 14_241, lookups: elapsed.length, p95_ms: (elapsed.sort.fetch(676) * 1000).round(2),
      max_ms: (elapsed.max * 1000).round(2), concurrent_lookups: concurrent.length,
      concurrent_max_ms: (concurrent.max * 1000).round(2), worker_statement_timeout_ms: 3000, worker_lock_timeout_ms: 1000)
  end

  def teardown
    # AIDEV-NOTE: Bulk fixture disposal needs its seeding budget; parent teardown closes this admin-only connection.
    if @admin
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      @admin.exec("SET statement_timeout='90s'")
    end
  ensure
    super
  end

  def concurrent_selections
    connections, threads, gate = [], [], Queue.new
    8.times { connections << connect("BE02_WORKER_DATABASE_URL", "elevateo_worker") }
    before = @admin.exec("SELECT turn FROM app_send_private.scheduler_cursor").getvalue(0, 0).to_i
    connections.each do |connection|
      threads << Thread.new do
        gate.pop
        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        raise "eligible backlog disappeared" unless due(connection: connection)
        Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
      end
      threads.last.report_on_exception = false
    end
    threads.length.times { gate << true }
    results = threads.map(&:value)
    assert_equal before + 8, @admin.exec("SELECT turn FROM app_send_private.scheduler_cursor").getvalue(0, 0).to_i
    results
  ensure
    # AIDEV-NOTE: Drain all launched workers before closing sockets, including when a sibling times out.
    failure = $!
    threads&.length&.times { gate << true }
    threads&.each do |thread|
      thread.join
    rescue StandardError => error
      failure ||= error
    end
    close_connections(connections || [])
    raise failure if failure
  end
end
