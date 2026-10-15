# frozen_string_literal: true

require_relative "approval_database_helper"
require_relative "../support/smtp_account"
require_relative "../../lib/elevateo/send_worker/database_store"

# AIDEV-NOTE: Every reservation starts with genuine API approval and the restricted worker login.
class SendBudgetDatabaseTestCase < SendDatabaseTestCase
  include SmtpAccountFixture

  def setup
    super
    create_smtp_account(destination_domains: ["example.invalid", "other.invalid"])
  end

  def prepare_submission(recipients: [[nil, "Recipient@example.invalid"]], connection: @worker, deadline: 10)
    @draft, @operation = SecureRandom.uuid, SecureRandom.uuid
    @saved = payload(subject: "Budget proof", body_text: "Private synthetic fixture",
      to: recipients.map { |name, address| { "display_name" => name, "address" => address } })
    assert_equal 1, save(@saved).fetch("version")
    bytes = snapshot(recipients: recipients)
    send_id = approve(bytes: bytes, review_digest: Digest::SHA256.hexdigest(bytes)).fetch("send_id")
    store = Elevateo::SendWorker::DatabaseStore.new(connection: connection, send_id: send_id,
      profile: "mox-smtp-test-v1", deadline_seconds: deadline)
    [store, store.claim(epoch: @epoch)]
  end

  def authorize(pair)
    store, claim = pair
    store.authorize_submission(claim: claim, epoch: @epoch)
  end

  def final_allowed(pair, authorization)
    store, claim = pair
    store.final_check(claim: claim, attempt_id: authorization.attempt_id, epoch: @epoch)
  end

  def usage
    @admin.exec(<<~SQL).to_a
      SELECT l.kind,l.scope,u.used FROM app_send_private.budget_usage u
        JOIN app_send_private.budget_limits l ON l.id=u.limit_id ORDER BY l.kind,l.scope
    SQL
  end

  def assert_no_reservation(pair, reason: "control_unavailable")
    assert_nil authorize(pair)
    assert_equal "0", @admin.exec("SELECT count(*) FROM app_send_private.attempts").getvalue(0, 0)
    assert_equal "0", @admin.exec("SELECT count(*) FROM app_send_private.attempt_budgets").getvalue(0, 0)
    assert_empty usage
    row = @admin.exec_params(<<~SQL, [pair.last.send_id]).first
      SELECT state,hold_reason,attempt_count,lease_id,next_check_at>clock_timestamp() AS deferred
        FROM app_send_private.jobs WHERE send_id=$1
    SQL
    assert_equal({ "state" => "queued", "hold_reason" => reason, "attempt_count" => "0",
      "lease_id" => nil, "deferred" => "t" }, row)
  end

  def budget_root = File.expand_path("../../db/be03_send", __dir__)

  def update_limit(assignment)
    @admin.exec("UPDATE app_send_private.budget_limits SET #{assignment},version=version+1")
  end
end
