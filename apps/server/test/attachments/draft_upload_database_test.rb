# frozen_string_literal: true
require_relative "draft_staging_database_helper"
require_relative "../../attachment_gateway/authority"

# AIDEV-NOTE: Real API and gateway logins prove reservation authority, recoverable slots and removal fencing.
class DraftUploadDatabaseTest < DraftStagingDatabaseTestCase
  def setup
    super
    @authority = Elevateo::AttachmentGateway::Authority.new(
      gateway_database_url: ENV.fetch("BE02_ATTACHMENT_GATEWAY_DATABASE_URL"),
      database_name: ENV.fetch("BE02_TASK_DATABASE_NAME"))
  end
  def gateway_claim
    session = @admin.exec_params(<<~SQL, [@digest]).first
      SELECT s.context_id,g.generation FROM app_auth.sessions s JOIN app_auth.authorization_generations g
        ON g.organization_id=s.organization_id AND g.user_id=s.user_id WHERE s.cookie_digest=$1
    SQL
    { "session_digest" => @digest, "expected_user_id" => @user, "expected_auth_session_id" => @auth,
      "context_id" => session.fetch("context_id"), "authorization_generation" => session.fetch("generation").to_i,
      "organization_id" => @org, "mailbox_id" => @box, "draft_id" => @draft,
      "operation_id" => @stage_operation, "reservation_token" => @reservation }
  end
  def remove
    stage_transaction do
      JSON.parse(@api.exec_params("SELECT app.remove_draft_attachment($1::text,$2::uuid,$3::uuid,$4::uuid)",
        [@digest, @box, @draft, @attachment]).getvalue(0, 0))
    end
  end
  def test_reserved_slot_is_visible_and_remove_fences_gateway_and_late_finalize
    reserve
    claim = gateway_claim
    assert_equal "drafts/#{@org}/#{@attachment}", @authority.draft_binding(claim).fetch("storage_key")
    assert_equal "scan_failed", attachment_list.fetch("items").first.fetch("status")
    assert_equal({"removed" => true}, remove)
    assert_empty attachment_list.fetch("items")
    assert_raises(Elevateo::AttachmentGateway::Denied) { @authority.draft_binding(claim) }
    assert_equal({"code" => "operation_retired"}, finalize)
    assert_equal "reserved", reserve(operation: SecureRandom.uuid, attachment: SecureRandom.uuid, token: SecureRandom.uuid).fetch("stage_state")
  end
  def test_committed_pending_scan_metadata_is_removable
    reserve
    finalize
    assert_equal "pending_scan", attachment_list.fetch("items").first.fetch("status")
    assert_equal({"removed" => true}, remove)
    assert_nil scan_row
    assert_equal "aborted", stage_rows.first.fetch("stage_state")
  end
  def test_gateway_cannot_cross_scope_or_reuse_revoked_compose_authority
    reserve
    claim = gateway_claim
    %w[mailbox_id draft_id operation_id reservation_token expected_user_id].each do |field|
      assert_raises(Elevateo::AttachmentGateway::Denied) { @authority.draft_binding(claim.merge(field => SecureRandom.uuid)) }
    end
    fixture_change do
      @admin.exec_params("UPDATE app.mailbox_memberships SET compose=false WHERE organization_id=$1 AND mailbox_id=$2 AND user_id=$3", [@org, @box, @user])
    end
    assert_raises(Elevateo::AttachmentGateway::Denied) { @authority.draft_binding(gateway_claim) }
    assert_equal({"code" => "not_available"}, remove)
  end
end
