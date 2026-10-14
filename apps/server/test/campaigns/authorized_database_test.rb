# frozen_string_literal: true

require_relative "../be_02/mailbox_membership_database_helper"
require_relative "../../lib/elevateo/campaigns/repository"

# AIDEV-NOTE: Soren runs this only in the named disposable fleet DB with real session digests and API RLS.
class CampaignAuthorizedDatabaseTest < MailboxMembershipDatabaseCase
  def sec802_default_fixture?
    false
  end

  def setup
    super
    @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'owner')",
      [@org, @user])
    @campaign_id = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [@campaign_id, @org, SecureRandom.uuid])
      INSERT INTO app.campaigns(id,organization_id,operation_id,name,status,creation_fingerprint)
      VALUES ($1,$2,$3,'OUT804 auth fixture','draft',repeat('a',64))
    SQL
  end

  def bind(value)
    ActiveRecord::Relation::QueryAttribute.new("out804", value, ActiveRecord::Type::String.new)
  end

  def outreach_scope(identity: @identity, write: false)
    scope(identity: identity, write: write) do |connection|
      function = write ? "app.authorize_outreach_draft_write" : "app.authorize_outreach_content_read"
      raw = connection.exec_query("SELECT #{function}($1::text) AS result", "OUT804 role", [bind(identity.digest)]).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
      assert_equal "ok", result.fetch("status")
      connection.exec_query("SELECT set_config('app.outreach_digest',$1,true)", "OUT804 RLS", [bind(identity.digest)])
      yield connection
    end
  end

  def seed_linked_unknown
    lead, operation = SecureRandom.uuid, SecureRandom.uuid
    @admin.exec_params(<<~SQL, [lead, @org, @campaign_id, SecureRandom.uuid])
      INSERT INTO app.campaign_leads(id,organization_id,campaign_id,operation_id,email,creation_fingerprint)
      VALUES ($1,$2,$3,$4,'a@example.invalid',repeat('a',64))
    SQL
    @admin.exec_params(<<~SQL, [@org, @campaign_id, lead, operation, @user])
      INSERT INTO app.campaign_consent_events(organization_id,campaign_id,lead_id,operation_id,actor_id,
        email,lead_version,status,evidence_kind)
      VALUES ($1,$2,$3,$4,$5,'a@example.invalid',2,'unknown','status_change')
    SQL
    @admin.exec_params("UPDATE app.campaign_leads SET consent_operation_id=$2,version=2 WHERE id=$1", [lead, operation])
    lead
  end

  def test_authorized_api_role_can_advance_metadata_without_replacing_consent_event
    lead = seed_linked_unknown
    result = nil
    outreach_scope(write: true) do |connection|
      assert_equal "elevateo_api", connection.select_value("SELECT current_user")
      result = connection.exec_query("UPDATE app.campaign_leads SET suppressed_at=now(),version=version+1 " \
        "WHERE organization_id=$1::uuid AND id=$2::uuid RETURNING version,consent_operation_id",
        "OUT804 metadata", [bind(@org), bind(lead)]).first
    end
    assert_equal 3, result.fetch("version")
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM app.campaign_consent_events WHERE lead_id=$1", [lead]).getvalue(0, 0)
    assert_raises(ActiveRecord::StatementInvalid) do
      outreach_scope(write: true) do |connection|
        connection.exec_query("UPDATE app.campaign_leads SET consent_operation_id=NULL,version=version+1 " \
          "WHERE organization_id=$1::uuid AND id=$2::uuid", "OUT804 clear link", [bind(@org), bind(lead)])
      end
    end
    assert_equal "3", @admin.exec_params("SELECT version FROM app.campaign_leads WHERE id=$1", [lead]).getvalue(0, 0)
  end

  def test_app_read_role_cannot_call_outreach_proof_from_rls
    assert_raises(ActiveRecord::StatementInvalid) do
      outreach_scope do |connection|
        connection.execute("SET LOCAL ROLE elevateo_app_read")
        assert_equal "elevateo_app_read", connection.select_value("SELECT current_user")
        connection.select_value("SELECT count(*) FROM app.campaigns")
      end
    end
  end

  def test_cross_actor_digest_cannot_reuse_current_session_context
    actor = add_actor
    @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'sales')",
      [@org, actor.user_id])
    scope(write: false) do |connection|
      raw = connection.exec_query("SELECT app.authorize_outreach_content_read($1::text) AS result",
        "OUT804 cross actor", [bind(actor.digest)]).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
      assert_equal "not_found", result.fetch("status")
    end
  end

  def test_sales_actor_without_shared_mailbox_membership_cannot_read_campaign_account
    actor = add_actor
    @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'sales')",
      [@org, actor.user_id])
    account = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [account, @org, @campaign_id, @box, SecureRandom.uuid])
      INSERT INTO app.campaign_accounts(id,organization_id,campaign_id,mailbox_id,operation_id,label,creation_fingerprint)
      VALUES ($1,$2,$3,$4,$5,'Shared pilot',repeat('a',64))
    SQL
    hidden = nil
    outreach_scope(identity: actor) do |connection|
      hidden = connection.exec_query("SELECT count(*) FROM app.campaign_accounts WHERE id=$1::uuid",
        "OUT804 hidden account", [bind(account)]).first.fetch("count")
    end
    assert_equal 0, hidden.to_i
    visible = nil
    outreach_scope do |connection|
      visible = connection.exec_query("SELECT count(*) FROM app.campaign_accounts WHERE id=$1::uuid",
        "OUT804 visible account", [bind(account)]).first.fetch("count")
    end
    assert_equal 1, visible.to_i
  end

  def test_repository_stale_update_rolls_back_its_own_preinserted_event
    lead = seed_linked_unknown
    operation = SecureRandom.uuid
    input = Elevateo::Campaigns::Input.new(kind: "lead", value: {
      "id" => lead, "operation_id" => operation, "campaign_id" => @campaign_id,
      "email" => "a@example.invalid", "consent_status" => "withdrawn",
      "consent_recorded_at" => nil, "consent_source" => nil, "suppressed" => false
    })
    error = assert_raises(Elevateo::CollaborationError) do
      outreach_scope(write: true) do |connection|
        Elevateo::Campaigns::Repository.new(connection: connection).replace(input,
          organization_id: @org, expected_version: 99, actor_id: @identity.user_id)
      end
    end
    assert_equal "draft_conflict", error.code
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app.campaign_consent_events WHERE operation_id=$1",
      [operation]).getvalue(0, 0)
  end
end
