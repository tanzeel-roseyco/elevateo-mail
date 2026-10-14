# frozen_string_literal: true

require_relative "../be_02/draft_database_test_helper"
require "digest"

class InboundDatabaseTest < DraftDatabaseTestCase
  ADDRESS = { "display_name" => nil, "address" => "sender@example.invalid" }.freeze
  RECIPIENTS = [{ "display_name" => nil, "address" => "inbox@example.invalid" }].freeze

  def ingest(org: @org, account: "account-a", event: "event-1", body: "hello", digest: nil)
    digest ||= Digest::SHA256.hexdigest(body)
    values = [@digest, @user, org, @box, account, event, digest,
              JSON.generate(ADDRESS), JSON.generate(RECIPIENTS), "Subject", body, "[]"]
    begin_write
    assert_equal "ok", write_guard(targets: [@user]).fetch("status")
    result = JSON.parse(@api.exec_params(<<~SQL, values).getvalue(0, 0))
      SELECT app.ingest_fake_mail($1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,
        $8::jsonb,$9::jsonb,$10::text,$11::text,$12::jsonb)
    SQL
    @api.exec("COMMIT")
    result
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end

  def counts
    %w[inbound_receipts threads messages].map do |table|
      @admin.exec_params("SELECT count(*) FROM app.#{table} WHERE organization_id=$1", [@org]).getvalue(0, 0).to_i
    end
  end

  def test_happy_path_is_visible_to_existing_inbox_tables_and_replay_is_stable
    first = ingest
    assert_equal "created", first.fetch("result")
    assert_equal [1, 1, 1], counts
    assert_equal "hello", @admin.exec_params("SELECT body_text FROM app.messages WHERE id=$1", [first.fetch("message_id")]).getvalue(0, 0)
    second = ingest
    assert_equal first.slice("thread_id", "message_id"), second.slice("thread_id", "message_id")
    assert_equal "duplicate", second.fetch("result")
    assert_equal [1, 1, 1], counts
  end

  def test_account_namespace_is_distinct_and_cross_tenant_is_rejected
    assert_equal "created", ingest.fetch("result")
    assert_equal "created", ingest(account: "account-b").fetch("result")
    assert_equal [2, 2, 2], counts
    assert_raises(PG::Error) { ingest(org: SecureRandom.uuid) }
    assert_equal [2, 2, 2], counts
  end

  def test_replay_mismatch_and_rollback_retry_do_not_lose_message
    assert_equal "created", ingest.fetch("result")
    assert_raises(PG::CheckViolation) { ingest(body: "changed") }
    assert_equal [1, 1, 1], counts
    begin_write
    assert_equal "ok", write_guard(targets: [@user]).fetch("status")
    @api.exec_params("SELECT app.ingest_fake_mail($1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::jsonb,$9::jsonb,$10::text,$11::text,$12::jsonb)",
      [@digest,@user,@org,@box,"account-a","rolled-back",Digest::SHA256.hexdigest("retry"),
       JSON.generate(ADDRESS),JSON.generate(RECIPIENTS),"Subject","retry","[]"])
    @api.exec("ROLLBACK")
    assert_equal "created", ingest(event: "rolled-back", body: "retry").fetch("result")
    assert_equal [2, 2, 2], counts
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end
end
