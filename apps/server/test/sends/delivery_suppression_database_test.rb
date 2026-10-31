# frozen_string_literal: true

require_relative "approval_database_helper"
require_relative "../../lib/elevateo/campaigns/repository"

# AIDEV-NOTE: Real review and worker gates must share safety identity without changing immutable snapshot bytes.
class DeliverySuppressionDatabaseTest < SendDatabaseTestCase
  class Connection
    def initialize(pg)
      @pg = pg
    end

    def exec_query(sql, _name, binds)
      result = @pg.exec_params(sql, binds.map(&:value_for_database))
      ActiveRecord::Result.new(result.fields, result.values)
    end
  end

  def teardown
    @admin.exec_params("DELETE FROM app.campaign_suppressions WHERE organization_id=$1", [@org]) if @admin && @org
    super
  end

  def campaign_suppression(reason)
    @admin.exec_params("INSERT INTO app.campaign_suppressions(organization_id,email,reason) VALUES($1,'RECIPIENT@EXAMPLE.invalid',$2)", [@org, reason])
  end

  def worker_json(sql, values)
    JSON.parse(@worker.exec_params(sql, values).getvalue(0, 0))
  end

  def claim_and_authorize(send, lease)
    assert_equal "submit", worker_json("SELECT app_send_private.claim_job($1,$2,$3,30)", [send, lease, @epoch]).fetch("action")
    worker_json(<<~SQL, [send, lease, SecureRandom.uuid, @epoch])
      SELECT app_send_private.authorize_attempt($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
        sha256(convert_to('local:synthetic-v1','UTF8')),'synthetic-v1',10)
    SQL
  end

  def test_recipient_case_variants_normalize_and_block_review
    @admin.exec_params("INSERT INTO app_send_private.recipient_suppressions VALUES($1,'RECIPIENT@EXAMPLE.invalid',clock_timestamp())", [@org])
    assert_equal "recipient@example.invalid", @admin.exec_params("SELECT canonical_address FROM app_send_private.recipient_suppressions WHERE organization_id=$1", [@org]).getvalue(0, 0)
    assert_equal ["Recipient@example.invalid"], review.fetch("suppressed_addresses")
    assert_equal "send_not_ready", approve.fetch("code")
    assert_raises(PG::UniqueViolation) do
      @admin.exec_params("INSERT INTO app_send_private.recipient_suppressions VALUES($1,'Recipient@example.invalid',clock_timestamp())", [@org])
    end
  end

  def test_campaign_bounce_blocks_correspondence_and_updates_policy
    campaign_suppression("bounce")
    assert_equal "recipient@example.invalid", @admin.exec_params("SELECT email FROM app.campaign_suppressions WHERE organization_id=$1", [@org]).getvalue(0, 0)
    assert_equal "2", @admin.exec_params("SELECT revision FROM app_send_private.organization_policy WHERE organization_id=$1", [@org]).getvalue(0, 0)
    assert_equal ["Recipient@example.invalid"], review.fetch("suppressed_addresses")
    assert_equal "send_not_ready", approve.fetch("code")
  end

  def test_marketing_only_suppression_does_not_block_correspondence
    %w[manual unsubscribe].each do |reason|
      campaign_suppression(reason)
      assert_empty review.fetch("suppressed_addresses")
      @admin.exec_params("DELETE FROM app.campaign_suppressions WHERE organization_id=$1", [@org])
    end
  end

  def test_existing_marketing_opt_out_is_promoted_by_bounce_without_downgrade
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    @api.exec_params("SELECT set_config('app.outreach_digest',$1,true)", [@digest])
    repository = Elevateo::Campaigns::Repository.new(connection: Connection.new(@api))
    %w[unsubscribe bounce manual].each do |reason|
      repository.suppress(organization_id: @org, email: "RECIPIENT@example.invalid", reason: reason)
    end
    @api.exec("COMMIT")
    assert_equal "bounce", @admin.exec_params("SELECT reason FROM app.campaign_suppressions WHERE organization_id=$1", [@org]).getvalue(0, 0)
    assert_equal ["Recipient@example.invalid"], review.fetch("suppressed_addresses")
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end

  def test_bounce_after_approval_blocks_attempt
    send = approve.fetch("send_id")
    campaign_suppression("bounce")
    assert_equal "dispatch_held", claim_and_authorize(send, SecureRandom.uuid).fetch("code")
  end

  def test_bounce_after_authorization_blocks_final_gate
    send = approve.fetch("send_id")
    lease = SecureRandom.uuid
    authorization = claim_and_authorize(send, lease)
    campaign_suppression("bounce")
    result = worker_json("SELECT app_send_private.final_attempt_check($1::uuid,$2::uuid,1,$3::uuid,$4::uuid)",
      [send, lease, authorization.fetch("attempt_id"), @epoch])
    refute result.fetch("allowed")
  end

  def test_shared_delivery_suppression_is_tenant_scoped
    campaign_suppression("bounce")
    assert_equal "f", @admin.exec_params("SELECT app_send_private.delivery_suppressed($1,'RECIPIENT@example.invalid')", [SecureRandom.uuid]).getvalue(0, 0)
    assert_equal "Recipient@example.invalid", @admin.exec("SELECT app_send_private.canonical_address('Recipient@EXAMPLE.invalid')").getvalue(0, 0)
  end
end
