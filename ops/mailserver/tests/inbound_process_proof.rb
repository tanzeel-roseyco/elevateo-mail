# frozen_string_literal: true

require_relative "inbound_process"

# AIDEV-NOTE: Exercise the shipped entrypoint with real SQL and TLS IMAP, including process restart and signals.
module MoxInboundProcessProof
  include MoxInboundProcess

  def test_process_import_shutdown_and_restart_preserve_receipts
    @scopes.each { |scope| submit_fixture_mail(scope.fetch(:address)) }
    with_worker_credentials do |path|
      env = process_environment(path)
      status, events, signalled = worker_process(env, ["--run"], signal: "TERM") do
        ready = @accounts.all? { |account| inbox_receipt(account).length == 1 }
        # AIDEV-NOTE: SMTP acceptance precedes local delivery; make empty first polls due again before stopping.
        @accounts.each { |account| @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_next_at=clock_timestamp() WHERE id=$1", [account]) } unless ready
        ready
      end
      assert_equal 0, status
      assert signalled
      assert(events.any? { |event| event["result"] == "polled" })
      assert_equal "idle", events.last.fetch("result")
      before = @accounts.to_h { |account| [account, inbox_receipt(account)] }
      @scopes.each do |scope|
        receipt = before.fetch(scope.fetch(:account))
        assert_equal 1, receipt.length
        assert_equal scope.fetch(:inbox), receipt.first.fetch("mailbox_id")
        assert_equal @body, receipt.first.fetch("body_text").strip
      end
      @accounts.each { |account| @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_next_at=clock_timestamp() WHERE id=$1", [account]) }
      2.times do
        exit_code, once_events, sent_signal = worker_process(env, ["--once"])
        assert_equal 0, exit_code
        refute sent_signal
        assert_equal ["polled"], (once_events.map { |event| event.fetch("result") })
      end
      assert_equal before, (@accounts.to_h { |account| [account, inbox_receipt(account)] })
      status, events, signalled = worker_process(env, ["--run"], signal: "INT")
      assert_equal 0, status
      assert signalled
      assert_equal ["idle"], (events.map { |event| event.fetch("result") })
      assert_no_poll_leases
    end
  end

  def test_process_rejects_bad_configuration_and_returns_failure_on_tls_error
    with_worker_credentials do |path|
      env = process_environment(path)
      [[env, ["--unexpected"]], [env.merge("ELEVATEO_IMAP_PROFILE" => "production"), ["--once"]],
        [env.merge("ELEVATEO_IMAP_CREDENTIALS_PATH" => "/missing-secret.json"), ["--once"]]].each do |settings, arguments|
        status, events, = worker_process(settings, arguments)
        assert_equal 1, status
        assert_equal [{ "event" => "inbound_worker.startup_failed", "simulated" => true }], events
      end
      status, events, = worker_process(env.merge("ELEVATEO_IMAP_CA_PATH" => "/missing-ca.pem"), ["--once"])
      assert_equal 1, status
      assert_equal ["failed"], (events.map { |event| event.fetch("result") })
      assert_equal 1, (@accounts.sum { |account|
        @admin.exec_params("SELECT poll_failures FROM app.inbound_imap_accounts WHERE id=$1", [account]).getvalue(0, 0).to_i
      })
      assert_no_poll_leases
    end
  end

  def test_process_event_boundary_rejects_final_chunk_overflow
    events = []
    64.times { append_process_event('{"result":"idle"}', events) }
    assert_equal 64, events.length
    assert_raises(RuntimeError) { append_process_event('{"result":"idle"}', events) }
    assert_equal 64, events.length
    assert_raises(RuntimeError) { append_process_event("[]", []) }
    assert_raises(JSON::ParserError) { append_process_event("{", []) }
  end

  def assert_no_poll_leases
    @accounts.each do |account|
      row = @admin.exec_params("SELECT poll_lease_token FROM app.inbound_imap_accounts WHERE id=$1", [account]).first
      assert_nil row.fetch("poll_lease_token")
    end
  end
end
