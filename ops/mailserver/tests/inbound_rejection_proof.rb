# frozen_string_literal: true

# AIDEV-NOTE: Real TLS IMAP and the shipped worker prove a poison message cannot block later tenant-visible mail.
module MoxInboundRejectionProof
  def rejected_receipts(account)
    @admin.exec_params("SELECT * FROM app.inbound_imap_rejections WHERE account_id=$1 ORDER BY uid", [account]).to_a
  end

  def make_scheduled_accounts_due
    @accounts.each do |account|
      @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_next_at=clock_timestamp() WHERE id=$1", [account])
    end
  end

  def run_until_inbound(env)
    status, events, signalled = worker_process(env, ["--run"], signal: "TERM") do
      ready = yield
      make_scheduled_accounts_due unless ready
      ready
    end
    assert_equal 0, status
    assert signalled
    assert(events.any? { |event| event["result"] == "polled" })
    refute(events.any? { |event| event["result"] == "failed" })
    assert_no_poll_leases
  end

  def test_real_process_records_poison_then_imports_good_mail_after_restart
    scope = @scopes.first
    account = scope.fetch(:account)
    poison = "Content-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\n\r\ncG9pc29u\r\n"
    submit_fixture_mail(scope.fetch(:address), mime: poison)
    binding = Elevateo::MailCredentials::Binding.new(account_id: account, organization_id: @org,
      mailbox_id: scope.fetch(:inbox), credential_version: 1, credential_ref: "test:scheduled-mox")
    identity = wait_for_inbox_identity(transport, binding, @subject)
    with_worker_credentials do |path|
      env = process_environment(path)
      run_until_inbound(env) { !rejected_inbox_identity(account, identity).nil? }
      rejected = rejected_receipts(account)
      receipt = rejected_inbox_identity(account, identity)
      refute_nil receipt
      assert_equal [account, @org, scope.fetch(:inbox), "unsupported_mime"],
        receipt.values_at("account_id", "organization_id", "mailbox_id", "reason")
      assert_match(/\A[0-9a-f]{64}\z/, receipt.fetch("content_sha256"))
      assert_empty inbox_receipt(account)
      row = @admin.exec_params("SELECT last_uid,poll_failures FROM app.inbound_imap_accounts WHERE id=$1", [account]).first
      assert_equal receipt.fetch("uid"), row.fetch("last_uid")
      assert_equal "0", row.fetch("poll_failures")
      # AIDEV-NOTE: Submit the valid tail after durable rejection so asynchronous Mox delivery cannot reorder the proof.
      submit_fixture_mail(scope.fetch(:address))
      make_scheduled_accounts_due
      run_until_inbound(env) { inbox_receipt(account).length == 1 }
      visible = inbox_receipt(account)
      assert_equal @body, visible.first.fetch("body_text").strip
      @body = visible.first.fetch("body_text")
      assert_inbox_visibility(visible.first.fetch("message_id"), scope.fetch(:inbox))
      uid = @admin.exec_params("SELECT uid FROM app.inbound_imap_receipts WHERE account_id=$1 AND message_id=$2",
        [account, visible.first.fetch("message_id")]).getvalue(0, 0).to_i
      assert_operator uid, :>, receipt.fetch("uid").to_i
      make_scheduled_accounts_due
      2.times do
        status, events, signalled = worker_process(env, ["--once"])
        assert_equal 0, status
        refute signalled
        assert_equal ["polled"], (events.map { |event| event.fetch("result") })
      end
      assert_equal rejected, rejected_receipts(account)
      assert_equal visible, inbox_receipt(account)
      assert_no_poll_leases
    end
  end
end
