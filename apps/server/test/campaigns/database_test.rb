# frozen_string_literal: true

require "minitest/autorun"
require "pg"
require "securerandom"

# AIDEV-NOTE: Soren runs this only against a named disposable fleet DB after migration 00009.
class CampaignDatabaseTest < Minitest::Test
  def setup
    @admin = connect("OUT804_ADMIN_DATABASE_URL", "supabase_admin")
    @api = connect("OUT804_API_DATABASE_URL", "elevateo_api")
    @org, @other_org, @user, @other_user = Array.new(4) { SecureRandom.uuid }
    @campaign, @private_box, @account = Array.new(3) { SecureRandom.uuid }
    [@org, @other_org].each { |org| @admin.exec_params("INSERT INTO app.organizations(id,name) VALUES ($1,'OUT804 disposable')", [org]) }
    @admin.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [@org, @user])
    @admin.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [@other_org, @other_user])
    @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES ($1,$2,$3,'private')",
      [@private_box, @org, "#{@private_box}@example.invalid"])
  end

  def teardown
    @api&.exec("ROLLBACK") if @api && @api.transaction_status != PG::PQTRANS_IDLE
    if @admin && @org
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      [@org, @other_org].each do |org|
        # AIDEV-NOTE: Remove account references before organization cascades delete their mailbox targets.
        @admin.exec_params("DELETE FROM app.campaign_accounts WHERE organization_id=$1", [org])
        @admin.exec_params("DELETE FROM app.organizations WHERE id=$1", [org])
      end
    end
  ensure
    @api&.close unless @api&.finished?
    @admin&.close unless @admin&.finished?
  end

  def connect(variable, expected_user)
    url = ENV.fetch(variable)
    expected_database = ENV.fetch("OUT804_TASK_DATABASE_NAME")
    raise "empty disposable database name" if expected_database.empty?
    connection = PG.connect(url)
    identity = connection.exec("SELECT session_user,current_database()").first
    raise "wrong database or role" unless identity.values_at("session_user", "current_database") == [expected_user, expected_database]
    connection.exec("SET statement_timeout='3s'; SET lock_timeout='1s'")
    connection
  end

  def claims(user, org)
    @api.exec("BEGIN")
    @api.exec_params("SELECT set_config('app.user_id',$1,true),set_config('app.org_id',$2,true)", [user, org])
  end

  def seed_unknown_lead
    lead = SecureRandom.uuid
    @admin.exec_params("INSERT INTO app.campaigns(id,organization_id,operation_id,name,status,creation_fingerprint) VALUES ($1,$2,$3,'Pilot','draft',repeat('a',64))",
      [@campaign, @org, SecureRandom.uuid])
    @admin.exec_params(<<~SQL, [lead, @org, @campaign, SecureRandom.uuid])
      INSERT INTO app.campaign_leads(id,organization_id,campaign_id,operation_id,email,creation_fingerprint)
      VALUES ($1,$2,$3,$4,'a@example.invalid',repeat('a',64))
    SQL
    lead
  end

  def consent_event(lead:, operation:, version:, status:, source: nil, observed_at: nil)
    @admin.exec_params(<<~SQL, [@org, @campaign, lead, operation, @user, version, status, source, observed_at])
      INSERT INTO app.campaign_consent_events(organization_id,campaign_id,lead_id,operation_id,actor_id,
        email,lead_version,status,evidence_kind,source,observed_at)
      VALUES ($1,$2,$3,$4,$5,'a@example.invalid',$6,$7,
        CASE WHEN $7='granted' THEN 'manual_attestation' ELSE 'status_change' END,$8,$9::timestamptz)
    SQL
  end

  def test_missing_digest_denies_reads_and_writes_despite_valid_tenant_claims
    @admin.exec_params("INSERT INTO app.campaigns(id,organization_id,operation_id,name,status,creation_fingerprint) VALUES ($1,$2,$3,'Pilot','draft',repeat('a',64))",
      [@campaign, @org, SecureRandom.uuid])
    claims(@user, @org)
    assert_equal "0", @api.exec_params("SELECT count(*) FROM app.campaigns WHERE id=$1", [@campaign]).getvalue(0, 0)
    @api.exec("SAVEPOINT denied_insert")
    assert_raises(PG::InsufficientPrivilege) do
      @api.exec_params("INSERT INTO app.campaigns(id,organization_id,operation_id,name,status,creation_fingerprint) VALUES ($1,$2,$3,'Other','draft',repeat('a',64))",
        [SecureRandom.uuid, @org, SecureRandom.uuid])
    end
    @api.exec("ROLLBACK TO SAVEPOINT denied_insert")
  end

  def test_foreign_claims_and_invalid_digest_remain_hidden
    @admin.exec_params("INSERT INTO app.campaigns(id,organization_id,operation_id,name,status,creation_fingerprint) VALUES ($1,$2,$3,'Pilot','draft',repeat('a',64))",
      [@campaign, @org, SecureRandom.uuid])
    claims(@other_user, @other_org)
    @api.exec_params("SELECT set_config('app.outreach_digest',$1,true)", [SecureRandom.hex(32)])
    assert_equal "0", @api.exec_params("SELECT count(*) FROM app.campaigns WHERE id=$1", [@campaign]).getvalue(0, 0)
  end

  def test_no_digest_hides_private_accounts_and_mutation_history
    @admin.exec_params("INSERT INTO app.campaigns(id,organization_id,operation_id,name,status,creation_fingerprint) VALUES ($1,$2,$3,'Pilot','draft',repeat('a',64))",
      [@campaign, @org, SecureRandom.uuid])
    @admin.exec_params(<<~SQL, [@account, @org, @campaign, @private_box, SecureRandom.uuid])
      INSERT INTO app.campaign_accounts(id,organization_id,campaign_id,mailbox_id,operation_id,label,creation_fingerprint)
      VALUES ($1,$2,$3,$4,$5,'Private',repeat('a',64))
    SQL
    @admin.exec_params(<<~SQL, [@org, SecureRandom.uuid, @account])
      INSERT INTO app.campaign_mutations(organization_id,operation_id,resource_kind,resource_id,fingerprint,result)
      VALUES ($1,$2,'account',$3,repeat('a',64),'{}'::jsonb)
    SQL
    claims(@user, @org)
    assert_equal "0", @api.exec_params("SELECT count(*) FROM app.campaign_accounts WHERE id=$1", [@account]).getvalue(0, 0)
    assert_equal "0", @api.exec_params("SELECT count(*) FROM app.campaign_mutations WHERE resource_id=$1", [@account]).getvalue(0, 0)
  end

  def test_storage_is_inert_and_rls_forced
    rows = @admin.exec(<<~SQL).to_a
      SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE relnamespace='app'::regnamespace AND relname IN
        ('campaigns','campaign_leads','campaign_consent_events','campaign_accounts','campaign_suppressions','campaign_mutations')
    SQL
    assert_equal 6, rows.length
    assert(rows.all? { |row| row.values_at("relrowsecurity", "relforcerowsecurity") == %w[t t] })
    assert_equal "f", @admin.exec("SELECT has_table_privilege('elevateo_worker','app.campaigns','INSERT')").getvalue(0, 0)
    assert_equal "f", @admin.exec("SELECT has_table_privilege('elevateo_api','app.campaign_consent_events','UPDATE')").getvalue(0, 0)
    assert_equal "f", @admin.exec("SELECT has_table_privilege('elevateo_api','app.campaign_mutations','UPDATE')").getvalue(0, 0)
    assert_equal "f", @admin.exec("SELECT has_table_privilege('elevateo_api','app.campaign_suppressions','DELETE')").getvalue(0, 0)
  end

  def test_linked_unknown_cannot_clear_event_but_metadata_can_advance
    lead = seed_unknown_lead
    operation = SecureRandom.uuid
    consent_event(lead: lead, operation: operation, version: 2, status: "unknown")
    @admin.exec_params("UPDATE app.campaign_leads SET consent_operation_id=$2,version=2 WHERE id=$1", [lead, operation])
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("UPDATE app.campaign_leads SET consent_operation_id=NULL,version=3 WHERE id=$1", [lead])
    end
    @admin.exec_params("UPDATE app.campaign_leads SET suppressed_at=now(),version=3 WHERE id=$1", [lead])
    assert_equal "3", @admin.exec_params("SELECT version FROM app.campaign_leads WHERE id=$1", [lead]).getvalue(0, 0)
  end

  def test_withdrawn_lead_rejects_old_grant_event_replay
    lead = seed_unknown_lead
    grant, withdraw = SecureRandom.uuid, SecureRandom.uuid
    consent_event(lead: lead, operation: grant, version: 2, status: "granted",
      source: "operator claim", observed_at: "2026-10-14T10:00:00Z")
    @admin.exec_params(<<~SQL, [lead, grant, @user])
      UPDATE app.campaign_leads SET consent_status='granted',consent_operation_id=$2,
        consent_source='operator claim',consent_recorded_at='2026-10-14T10:00:00Z',
        consent_recorded_by=$3,version=2 WHERE id=$1
    SQL
    consent_event(lead: lead, operation: withdraw, version: 3, status: "withdrawn")
    @admin.exec_params(<<~SQL, [lead, withdraw])
      UPDATE app.campaign_leads SET consent_status='withdrawn',consent_operation_id=$2,
        consent_source=NULL,consent_recorded_at=NULL,consent_recorded_by=NULL,version=3 WHERE id=$1
    SQL
    assert_raises(PG::CheckViolation) do
      @admin.exec_params(<<~SQL, [lead, grant, @user])
        UPDATE app.campaign_leads SET consent_status='granted',consent_operation_id=$2,
          consent_source='operator claim',consent_recorded_at='2026-10-14T10:00:00Z',
          consent_recorded_by=$3,version=4 WHERE id=$1
      SQL
    end
    assert_equal "withdrawn", @admin.exec_params("SELECT consent_status FROM app.campaign_leads WHERE id=$1", [lead]).getvalue(0, 0)
  end

  def test_stale_projection_rolls_back_preinserted_event
    lead = seed_unknown_lead
    operation = SecureRandom.uuid
    @admin.exec("BEGIN")
    consent_event(lead: lead, operation: operation, version: 2, status: "withdrawn")
    result = @admin.exec_params("UPDATE app.campaign_leads SET consent_status='withdrawn',consent_operation_id=$2,version=2 WHERE id=$1 AND version=99",
      [lead, operation])
    assert_equal 0, result.cmd_tuples
    @admin.exec("ROLLBACK")
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app.campaign_consent_events WHERE operation_id=$1", [operation]).getvalue(0, 0)
  end
end
