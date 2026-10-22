# frozen_string_literal: true

require_relative "mox_worker_database_test"

# AIDEV-NOTE: Restricted API/worker connections exercise production authority without any SMTP network IO.
class ProductionMoxDatabaseTest < SendMoxWorkerDatabaseTest
  MODE = "mox-smtp-v1"
  SOURCE = "mox_smtp_v1"
  RECEIPT = "mox-v1:#{'d' * 64}"

  def setup
    super
    # AIDEV-NOTE: Namespace rotation is a credential change and must advance the guarded account generation.
    @admin.exec_params("UPDATE app_send_private.smtp_accounts SET credential_ref='secret:synthetic',credential_version=credential_version+1 WHERE id=$1", [@smtp_account])
    @admin.exec_params(<<~SQL, [@org])
      INSERT INTO app_send_private.mox_domains(organization_id,domain,enabled,verified_at,evidence_ref)
        VALUES($1,'example.invalid',true,now(),repeat('a',64))
    SQL
    grant_consent
  end

  def teardown
    @admin.exec_params("DELETE FROM app_send_private.mox_domains WHERE organization_id=$1", [@org]) if @admin && @org
    super
  end

  def smtp_binding
    mail_binding(account_id: @smtp_account, organization_id: @org, mailbox_id: @box,
      credential_version: 2, credential_ref: "secret:synthetic")
  end

  # AIDEV-NOTE: Parent helpers close over fixture constants; production deliberately supplies its own route.
  def run_worker(send_id, kind: "accepted", receipt: RECEIPT)
    calls = 0
    expected = smtp_binding.key(protocol: "smtp")
    driver = Object.new
    driver.define_singleton_method(:submit) do |_bytes, credential_binding:, **_|
      raise "binding mismatch" unless credential_binding.key(protocol: "smtp") == expected
      calls += 1
      Elevateo::SendWorker::SubmissionResult.new(kind: kind, receipt_ref: kind == "accepted" ? receipt : nil,
        code: kind == "unknown" ? "smtp_uncertain" : nil)
    end
    driver.define_singleton_method(:observation) { |**_| nil }
    Dir.mktmpdir("production-mox-control") do |dir|
      path = File.join(dir, "control.json")
      File.write(path, JSON.generate(epoch: @epoch, outbound_held: false))
      store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: send_id, profile: MODE)
      [Elevateo::SendWorker::Executor.new(store: store, driver: driver,
        control: Elevateo::SendWorker::Control.new(path: path)).run_once, calls]
    end
  end

  def approve_sql(connection: @api, operation: @operation, version: 1, review_digest: @review_digest,
    bytes: @bytes, epoch: @epoch, digest: @digest)
    JSON.parse(connection.exec_params(<<~SQL, [digest, @box, @draft, operation, version, review_digest, bytes.unpack1("H*"), epoch]).getvalue(0, 0))
      SELECT app.approve_draft_send($1::text,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::text,
        decode($7::text,'hex'),$8::uuid,'mox'::text)
    SQL
  end

  def test_production_acceptance_has_distinct_provenance_and_no_replay
    send_id = approve.fetch("send_id")
    refute status(send_id).fetch("simulated")
    assert_equal [:accepted, 1], run_worker(send_id)
    row = @admin.exec_params(<<~SQL, [send_id]).first
      SELECT a.profile,o.source,o.receipt_ref FROM app_send_private.attempts a
        JOIN app_send_private.observations o ON o.attempt_id=a.attempt_id WHERE a.send_id=$1
    SQL
    assert_equal({ "profile" => MODE, "source" => SOURCE, "receipt_ref" => RECEIPT }, row)
    assert_equal [:idle, 0], run_worker(send_id)
  end

  def test_unknown_is_durable_and_reconciliation_never_resubmits
    send_id = approve.fetch("send_id")
    assert_equal [:unknown, 1], run_worker(send_id, kind: "unknown")
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp() WHERE send_id=$1", [send_id])
    assert_equal [:unknown, 0], run_worker(send_id)
    assert_equal 1, status(send_id).fetch("attempts")
  end

  def test_disabled_domain_and_restricted_roles_block_before_io
    send_id = approve.fetch("send_id")
    @admin.exec_params("UPDATE app_send_private.mox_domains SET enabled=false WHERE organization_id=$1", [@org])
    assert_equal [:held, 0], run_worker(send_id)
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app_send_private.attempts WHERE send_id=$1", [send_id]).getvalue(0, 0)
    assert_raises(PG::InsufficientPrivilege) { @worker.exec("SELECT * FROM app_send_private.mox_domains") }
    assert_raises(PG::InsufficientPrivilege) { @api.exec("UPDATE app_send_private.mox_domains SET enabled=true") }
  end

  def test_rotated_account_version_blocks_final_fence
    send_id = approve.fetch("send_id")
    lease, attempt = SecureRandom.uuid, SecureRandom.uuid
    @worker.exec_params("SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,30)", [send_id, lease, @epoch])
    result = @worker.exec_params(<<~SQL, [send_id, lease, attempt, @epoch]).getvalue(0, 0)
      SELECT app_send_private.authorize_attempt($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
        sha256(convert_to('provider:mox-smtp-v1','UTF8')),'mox-smtp-v1',10)
    SQL
    assert_equal attempt, JSON.parse(result).fetch("attempt_id")
    @admin.exec_params("UPDATE app_send_private.smtp_accounts SET credential_version=credential_version+1 WHERE id=$1", [@smtp_account])
    result = @worker.exec_params(<<~SQL, [send_id, lease, attempt, @epoch]).getvalue(0, 0)
      SELECT app_send_private.final_attempt_check($1::uuid,$2::uuid,1,$3::uuid,$4::uuid)
    SQL
    refute JSON.parse(result).fetch("allowed")
  end

  def test_other_tenant_domain_does_not_authorize_this_tenant
    other_org = SecureRandom.uuid
    @admin.exec_params("INSERT INTO app.organizations(id,name) VALUES($1,'Other disposable tenant')", [other_org])
    @admin.exec_params(<<~SQL, [other_org])
      INSERT INTO app_send_private.mox_domains(organization_id,domain,enabled,verified_at,evidence_ref)
        VALUES($1,'example.invalid',true,now(),repeat('b',64))
    SQL
    send_id = approve.fetch("send_id")
    @admin.exec_params("DELETE FROM app_send_private.mox_domains WHERE organization_id=$1", [@org])
    assert_equal [:held, 0], run_worker(send_id)
  ensure
    if other_org
      @admin.exec_params("DELETE FROM app_send_private.mox_domains WHERE organization_id=$1", [other_org])
      @admin.exec_params("DELETE FROM app.organizations WHERE id=$1", [other_org])
    end
  end

  def test_missing_consent_blocks_approval
    @admin.exec("BEGIN; SET LOCAL session_replication_role=replica")
    @admin.exec_params("DELETE FROM app.campaign_consent_events WHERE organization_id=$1", [@org])
    @admin.exec_params("DELETE FROM app.campaign_leads WHERE organization_id=$1", [@org])
    @admin.exec("COMMIT")
    assert_equal "consent_required", approve.fetch("code")
  end

  def test_budget_exhaustion_blocks_authorization
    send_id = approve.fetch("send_id")
    @admin.exec_params("UPDATE app_send_private.budget_limits SET enabled=false,version=version+1 WHERE id=$1", [@budget_limit_ids.first])
    assert_equal [:held, 0], run_worker(send_id)
  end

  def test_null_transport_mode_is_rejected_at_sql_boundary
    [false, true].each do |existing|
      approve if existing
      before = @admin.exec("SELECT count(*) FROM app_send_private.intents").getvalue(0, 0)
      result = @api.exec_params(<<~SQL, [@digest, @box, @draft, @operation, @review_digest, @epoch, @bytes.unpack1("H*")]).getvalue(0, 0)
        SELECT app.approve_draft_send($1::text,$2::uuid,$3::uuid,$4::uuid,1,$5::text,decode($7::text,'hex'),$6::uuid,NULL::text)
    SQL
      assert_equal "request_invalid", JSON.parse(result).fetch("code")
      assert_equal before, @admin.exec("SELECT count(*) FROM app_send_private.intents").getvalue(0, 0)
    end
  end

  def test_enabled_domain_requires_nonnull_evidence
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("UPDATE app_send_private.mox_domains SET evidence_ref=NULL WHERE organization_id=$1", [@org])
    end
  end

  # AIDEV-NOTE: Parent cases target historical fixture down SQL and constants; keep those in the original class only.
  SendMoxWorkerDatabaseTest.instance_methods(false).grep(/^test_/).each { |name| undef_method name }

  private

  def grant_consent
    campaign, lead, operation = Array.new(3) { SecureRandom.uuid }
    @admin.exec_params(<<~SQL, [campaign, @org, SecureRandom.uuid])
      INSERT INTO app.campaigns(id,organization_id,operation_id,name,creation_fingerprint)
        VALUES($1,$2,$3,'Disposable Mox',repeat('a',64))
    SQL
    @admin.exec_params(<<~SQL, [lead, @org, campaign, SecureRandom.uuid])
      INSERT INTO app.campaign_leads(id,organization_id,campaign_id,operation_id,email,creation_fingerprint)
        VALUES($1,$2,$3,$4,'Recipient@example.invalid',repeat('a',64))
    SQL
    @admin.exec_params(<<~SQL, [@org, campaign, lead, operation, @user])
      INSERT INTO app.campaign_consent_events(organization_id,campaign_id,lead_id,operation_id,actor_id,
        email,lead_version,status,evidence_kind,source,observed_at)
        VALUES($1,$2,$3,$4,$5,'Recipient@example.invalid',2,'granted','manual_attestation','Docker fixture',now())
    SQL
    @admin.exec_params(<<~SQL, [lead, operation, @user])
      UPDATE app.campaign_leads SET consent_status='granted',consent_recorded_at=now(),
        consent_source='Docker fixture',consent_recorded_by=$3,consent_operation_id=$2,version=2 WHERE id=$1
    SQL
  end
end
