# frozen_string_literal: true

require_relative "../sends/approval_database_helper"
require_relative "../../lib/elevateo/campaigns/runs"
require_relative "../../lib/elevateo/session_presentation"
require_relative "../../lib/elevateo/cursors"

# AIDEV-NOTE: API-role queries exercise real RLS/approval SQL; admin is only used for isolated fixture setup.
class MarketingRunsDatabaseTest < SendDatabaseTestCase
  class Connection
    def initialize(pg)
      @pg = pg
      @pg.type_map_for_results = PG::BasicTypeMapForResults.new(pg)
    end

    def exec_query(sql, _name, binds)
      result = @pg.exec_params(sql, binds.map(&:value_for_database))
      ActiveRecord::Result.new(result.fields, result.values)
    end
  end

  def setup
    super
    @campaign, @lead = Array.new(2) { SecureRandom.uuid }
    fixture_change do
      @admin.exec_params("INSERT INTO app.campaigns(id,organization_id,name,operation_id,creation_fingerprint) VALUES($1,$2,'Campaign',$1,$3)", [@campaign,@org,"a" * 64])
      @admin.exec_params("INSERT INTO app.campaign_leads(id,organization_id,campaign_id,email,operation_id,creation_fingerprint,consent_status,consent_recorded_at,consent_recorded_by,consent_source,consent_operation_id,version) VALUES($1,$2,$3,'Recipient@example.invalid',$1,$5,'granted','2026-01-01',$4,'Signup',$1,2)", [@lead,@org,@campaign,@user,"b" * 64])
      @admin.exec_params("INSERT INTO app.campaign_consent_events(organization_id,campaign_id,lead_id,operation_id,actor_id,email,lead_version,status,evidence_kind,source,observed_at) VALUES($1,$2,$3,$3,$4,'Recipient@example.invalid',2,'granted','manual_attestation','Signup','2026-01-01')", [@org,@campaign,@lead,@user])
    end
    identity = Elevateo::SessionIdentity.new(user_id: @user, org_id: @org, auth_session_id: @auth, digest: @digest, display_name: nil, metadata: {})
    @runs = Elevateo::Campaigns::Runs.new(connection: Connection.new(@api), session: {"context_id" => "c" * 32, "authorization_version" => "v" * 32}, identity: identity, outbound_mode: "held", epoch: @epoch)
    @input = Elevateo::Campaigns::RunInput.new({"operation_id" => SecureRandom.uuid,"mailbox_id" => @box,"expected_campaign_version" => 1,"subject" => "Newsletter","body_text" => "Hello subscriber","lead_ids" => [@lead],"marketing_confirmed" => true})
  end

  def teardown
    @api.exec("ROLLBACK") if @api && @api.transaction_status != PG::PQTRANS_IDLE
    if @admin && @org
      @admin.exec_params("DELETE FROM app.marketing_enrollments WHERE organization_id=$1", [@org])
      @admin.exec_params("DELETE FROM app.marketing_runs WHERE organization_id=$1", [@org])
    end
    super
  end

  def transaction
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    @api.exec_params("SELECT set_config('app.outreach_digest',$1,true)", [@digest])
    result = yield
    @api.exec("COMMIT")
    result
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end

  def test_atomic_queue_replay_and_cancel
    run = transaction { @runs.create(@campaign, @input, request_id: SecureRandom.uuid) }
    assert_equal "queued", run.fetch("state")
    assert_equal "queued", run.fetch("recipients").first.fetch("state")
    replay = transaction { @runs.create(@campaign, @input, request_id: SecureRandom.uuid) }
    assert_equal run.fetch("id"), replay.fetch("id")
    snapshot = @admin.exec_params("SELECT convert_from(snapshot_bytes,'UTF8') FROM app_send_private.intents WHERE send_id=$1", [run.fetch("recipients").first.fetch("send_id")]).getvalue(0,0)
    assert_equal ["marketing", "recorded_marketing_consent"], JSON.parse(snapshot)[10,2]
    cancelled = transaction { @runs.cancel(@campaign, run.fetch("id")) }
    assert_equal "cancelled", cancelled.fetch("state")
    assert_equal "cancelled", cancelled.fetch("recipients").first.fetch("state")
  end

  def test_withdrawn_or_paused_audience_cannot_queue
    fixture_change { @admin.exec_params("UPDATE app.campaigns SET status='paused' WHERE id=$1", [@campaign]) }
    assert_raises(Elevateo::CollaborationError) { transaction { @runs.create(@campaign, @input, request_id: SecureRandom.uuid) } }
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app.marketing_runs WHERE organization_id=$1", [@org]).getvalue(0,0)
  end
end
