# frozen_string_literal: true

require_relative "../be_02/mailbox_membership_database_helper"
require_relative "../../lib/elevateo/outreach_sequence/repository"

# AIDEV-NOTE: Disposable fleet DB only; inherited fixture owns real API login, session proof and cleanup.
class OutreachSequenceAuthorizedDatabaseTest < MailboxMembershipDatabaseCase
  DraftInput = Elevateo::OutreachSequence::DraftInput
  Repository = Elevateo::OutreachSequence::Repository
  DraftError = Elevateo::OutreachSequence::DraftError

  def sec802_default_fixture?
    false
  end

  def setup
    super
    @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'owner')",
      [@org, @user])
    @campaign_id, @sequence_id, @step_id = Array.new(3) { SecureRandom.uuid }
    @admin.exec_params(<<~SQL, [@campaign_id, @org, SecureRandom.uuid])
      INSERT INTO app.campaigns(id,organization_id,operation_id,name,status,creation_fingerprint)
      VALUES ($1,$2,$3,'SEQ863 fixture','draft',repeat('a',64))
    SQL
  end

  # AIDEV-NOTE: Remove explicit sequence dependencies before inherited campaign and final-owner fixture cleanup.
  def prepare_organization_fixture_cleanup
    %w[campaign_sequence_mutations campaign_sequence_occurrences campaign_sequence_steps campaign_sequences].each do |table|
      @admin.exec_params("DELETE FROM app.#{table} WHERE organization_id=$1", [@org])
    end
  end

  def bind(value)
    ActiveRecord::Relation::QueryAttribute.new("seq863", value, ActiveRecord::Type::String.new)
  end

  def repository(connection)
    Repository.new(connection: connection)
  end

  def input(version: nil, operation: SecureRandom.uuid, label: "First")
    DraftInput.new(value: { "id" => @sequence_id, "campaign_id" => @campaign_id,
      "operation_id" => operation, "expected_version" => version, "status" => "held",
      "timezone" => "Europe/Berlin", "steps" => [{ "id" => @step_id, "position" => 1,
        "delay_seconds" => 0, "local_time" => "09:00:00", "label" => label }] })
  end

  def seed_draft
    @admin.exec_params(<<~SQL, [@sequence_id, @org, @campaign_id])
      INSERT INTO app.campaign_sequences(id,organization_id,campaign_id,status,timezone,version)
      VALUES ($1,$2,$3,'held','Europe/Berlin',1)
    SQL
    @admin.exec_params(<<~SQL, [@step_id, @org, @campaign_id, @sequence_id])
      INSERT INTO app.campaign_sequence_steps
        (id,organization_id,campaign_id,sequence_id,position,delay_seconds,local_time,label)
      VALUES ($1,$2,$3,$4,1,0,'09:00:00','First')
    SQL
  end

  def test_get_uses_content_read_for_current_actor_and_hides_absent_or_foreign_org
    seed_draft
    scope(write: false) do |connection|
      # AIDEV-NOTE: Runtime grants are inherited; the API login must never impersonate the read role.
      assert_equal "elevateo_api", connection.select_value("SELECT current_user")
      assert_equal false, connection.select_value("SELECT pg_has_role(current_user,'elevateo_app_read','SET')")
      result = repository(connection).fetch(campaign_id: @campaign_id, organization_id: @org,
        session_digest: @identity.digest)
      assert_equal @sequence_id, result.fetch("id")
      assert_equal [{ "id" => @step_id, "position" => 1, "delay_seconds" => 0,
        "local_time" => "09:00:00", "label" => "First" }], result.fetch("steps")
      assert_nil repository(connection).fetch(campaign_id: SecureRandom.uuid, organization_id: @org,
        session_digest: @identity.digest)
      assert_nil repository(connection).fetch(campaign_id: @campaign_id, organization_id: SecureRandom.uuid,
        session_digest: @identity.digest)
    end
  end

  def test_get_hides_cross_actor_digest_and_revoked_current_role
    seed_draft
    actor = add_actor
    @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'sales')",
      [@org, actor.user_id])
    scope(write: false) do |connection|
      assert_nil repository(connection).fetch(campaign_id: @campaign_id, organization_id: @org,
        session_digest: actor.digest)
    end
    scope(identity: actor, write: false) do |connection|
      refute_nil repository(connection).fetch(campaign_id: @campaign_id, organization_id: @org,
        session_digest: actor.digest)
    end
    # AIDEV-NOTE: Revoke the sales actor while preserving the sole owner and its production guard.
    @admin.exec_params("DELETE FROM app.organization_access WHERE organization_id=$1 AND user_id=$2",
      [@org, actor.user_id])
    scope(identity: actor, write: false) do |connection|
      assert_nil repository(connection).fetch(campaign_id: @campaign_id, organization_id: @org,
        session_digest: actor.digest)
    end
  end

  def test_valid_digest_and_tenant_guc_cannot_insert_or_update_without_private_marker
    seed_draft
    statements = [
      ["INSERT INTO app.campaign_sequence_steps " \
        "(id,organization_id,campaign_id,sequence_id,position,delay_seconds,local_time,label) " \
        "VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,2,0,'10:00:00','Second')",
        [SecureRandom.uuid, @org, @campaign_id, @sequence_id]],
      ["UPDATE app.campaign_sequences SET version=version+1 WHERE id=$1::uuid", [@sequence_id]],
      ["DELETE FROM app.campaign_sequence_steps WHERE id=$1::uuid", [@step_id]]
    ]
    statements.each do |sql, values|
      error = assert_raises(ActiveRecord::StatementInvalid) do
        CollaborationApiRecord.connection_pool.with_connection do |connection|
          principal = Elevateo::Tenancy::Principal.new(user_id: @user, org_id: @org)
          Elevateo::Tenancy.with_context(principal, connection: connection, read_only: false) do
            connection.exec_query("SELECT set_config('app.outreach_digest',$1,true)", "SEQ863 digest", [bind(@identity.digest)])
            connection.exec_query(sql, "SEQ863 unguarded write", values.map { |value| bind(value) })
          end
        end
      end
      assert_match(/protected write guard required/i, error.message)
    end
    assert_equal "1", @admin.exec_params("SELECT version FROM app.campaign_sequences WHERE id=$1", [@sequence_id]).getvalue(0, 0)
  end

  def test_protected_create_update_for_update_and_stale_version
    first = nil
    scope(write: true) do |connection|
      first = repository(connection).save(input, organization_id: @org, session_digest: @identity.digest)
    end
    assert_equal 1, first.fetch("version")
    scope(write: true) do |connection|
      result = repository(connection).save(input(version: 1, label: "Revised"),
        organization_id: @org, session_digest: @identity.digest)
      assert_equal 2, result.fetch("version")
    end
    error = assert_raises(DraftError) do
      scope(write: true) do |connection|
        repository(connection).save(input(version: 1), organization_id: @org,
          session_digest: @identity.digest)
      end
    end
    assert_equal "draft_conflict", error.code
    assert_equal "2", @admin.exec_params("SELECT version FROM app.campaign_sequences WHERE id=$1", [@sequence_id]).getvalue(0, 0)
  end
end
