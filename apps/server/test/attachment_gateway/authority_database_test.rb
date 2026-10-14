# frozen_string_literal: true

require "digest"
require_relative "../be_02/mailbox_membership_database_helper"
require_relative "../../attachment_gateway/authority"

class AttachmentGatewayAuthorityDatabaseTest < MailboxMembershipDatabaseCase
  def setup
    super
    @attachment = SecureRandom.uuid
    @message = fixture_message(body: "synthetic attachment message")
    fixture_change(@org) do
      @admin.exec_params("UPDATE app.mailboxes SET visibility='private' WHERE id=$1", [@box])
    end
    # AIDEV-NOTE: This admin-only synthetic clean row tests download authority, not a scanner verdict.
    @admin.exec_params(<<~SQL, [@attachment, @org, @box, @thread, @message,
      "quarantine/#{@org}/#{@attachment}", Digest::SHA256.hexdigest("fixture".b)])
      INSERT INTO app.inbox_attachments(id,organization_id,mailbox_id,thread_id,message_id,storage_key,
        filename,content_type,byte_size,sha256,scan_status)
      VALUES ($1,$2,$3,$4,$5,$6,'fixture.txt','text/plain',7,$7,'clean')
    SQL
    session = @admin.exec_params(<<~SQL, [@digest]).first
      SELECT s.context_id,g.generation FROM app_auth.sessions s JOIN app_auth.authorization_generations g
        ON g.organization_id=s.organization_id AND g.user_id=s.user_id WHERE s.cookie_digest=$1
    SQL
    @claim = { "attachment_id" => @attachment, "organization_id" => @org, "mailbox_id" => @box,
               "thread_id" => @thread, "message_id" => @message, "session_digest" => @digest,
               "expected_user_id" => @user, "expected_auth_session_id" => @auth,
               "context_id" => session.fetch("context_id"), "context_uuid" => session.fetch("context_id"),
               "authorization_version" => "a" * 43,
               "authorization_generation" => Integer(session.fetch("generation"), 10) }
    @authority = Elevateo::AttachmentGateway::Authority.new(
      gateway_database_url: ENV.fetch("BE02_ATTACHMENT_GATEWAY_DATABASE_URL"),
      database_name: ENV.fetch("BE02_TASK_DATABASE_NAME"))
  end

  def test_clean_exact_message_binding_returns_private_metadata_to_gateway_only
    row = @authority.clean_binding(@claim)
    assert_equal "quarantine/#{@org}/#{@attachment}", row.fetch("storage_key")
    assert_equal "7", row.fetch("byte_size")
    assert_equal Digest::SHA256.hexdigest("fixture".b), row.fetch("sha256")
    assert_raises(Elevateo::AttachmentGateway::Denied) do
      @authority.clean_binding(@claim.merge("message_id" => SecureRandom.uuid))
    end
  end

  def test_private_member_with_read_only_grant_can_download
    @admin.exec_params(<<~SQL, [@org, @box, @user])
      UPDATE app.mailbox_memberships SET compose=false,approve_send=false,manage_members=false
      WHERE organization_id=$1 AND mailbox_id=$2 AND user_id=$3
    SQL
    @claim["authorization_generation"] = generation
    assert_equal "quarantine/#{@org}/#{@attachment}", @authority.clean_binding(@claim).fetch("storage_key")
  end

  def test_membership_revocation_between_checks_denies_private_mailbox
    assert @authority.clean_binding(@claim)
    member_change(@user) do |connection|
      connection.exec_params("DELETE FROM app.mailbox_memberships WHERE organization_id=$1 AND mailbox_id=$2 AND user_id=$3",
        [@org, @box, @user])
    end
    assert_raises(Elevateo::AttachmentGateway::Denied) { @authority.clean_binding(@claim) }
  end

  def test_nonclean_row_is_held_before_private_key_lookup
    @admin.exec_params("UPDATE app.inbox_attachments SET scan_status='malware' WHERE id=$1", [@attachment])
    assert_raises(Elevateo::AttachmentGateway::Denied) { @authority.clean_binding(@claim) }
  end

  def test_gateway_role_has_only_narrow_helper_and_rejects_forged_identity
    signature = "app_attachment_gateway.private_binding(text,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,uuid)"
    privileges = @admin.exec_params(<<~SQL, [signature]).first
      SELECT has_function_privilege('elevateo_attachment_gateway',$1,'EXECUTE') AS helper,
        has_function_privilege('elevateo_attachment_gateway',
          'app_auth.authorize_session(text,uuid,uuid,uuid,bigint)','EXECUTE') AS session,
        has_table_privilege('elevateo_attachment_gateway','app.inbox_attachments','SELECT') AS table_read,
        has_schema_privilege('elevateo_attachment_gateway','app','USAGE') AS app_schema,
        has_schema_privilege('elevateo_attachment_gateway','app_auth','USAGE') AS auth_schema
    SQL
    assert_equal({ "helper" => "t", "session" => "f", "table_read" => "f",
                   "app_schema" => "f", "auth_schema" => "f" }, privileges)
    %w[expected_user_id expected_auth_session_id context_uuid organization_id message_id].each do |key|
      assert_raises(Elevateo::AttachmentGateway::Denied) do
        @authority.clean_binding(@claim.merge(key => SecureRandom.uuid))
      end
    end
    assert_raises(Elevateo::AttachmentGateway::Denied) do
      @authority.clean_binding(@claim.merge("authorization_generation" => @claim.fetch("authorization_generation") + 1))
    end
    assert_raises(Elevateo::AttachmentGateway::Denied) do
      @authority.clean_binding(@claim.merge("session_digest" => "0" * 64))
    end
  end
end
