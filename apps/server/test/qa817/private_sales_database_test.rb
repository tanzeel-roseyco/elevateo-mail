# frozen_string_literal: true

require_relative "../be_02/mailbox_membership_database_helper"
require_relative "../../lib/elevateo/mailbox_reads"

# AIDEV-NOTE: Org role is metadata; private mailbox RLS needs an explicit current membership.
class QA817PrivateSalesDatabaseTest < MailboxMembershipDatabaseCase
  # AIDEV-NOTE: These role-specific cases seed their own grants; inherited cleanup owns final-owner removal.
  def sec802_default_fixture?
    false
  end

  def setup
    super
    @sales_box = mailbox(visibility: "private")
    @personal_box = mailbox(visibility: "private")
    @sales = add_actor
    @unassigned_sales = add_actor
    @admin_actor = add_actor
    [[@sales, "sales"], [@unassigned_sales, "sales"], [@admin_actor, "admin"]].each do |actor, role|
      @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,$3)",
        [@org, actor.user_id, role])
    end
    @admin.exec_params("INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification) VALUES ($1,$2,'team')",
      [@org, @sales_box])
    @admin.exec_params("INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification,personal_owner_id) VALUES ($1,$2,'personal',$3)",
      [@org, @personal_box, @user])
    explicit_member(@sales, box: @sales_box)
  end

  def test_assigned_sales_reads_private_team_mailbox
    assert_includes visible_ids(@sales), @sales_box
  end

  def test_unassigned_sales_cannot_read_private_team_mailbox
    refute_includes visible_ids(@unassigned_sales), @sales_box
  end

  def test_organization_admin_does_not_gain_personal_mail_content
    refute_includes visible_ids(@admin_actor), @personal_box
  end

  private

  def visible_ids(actor)
    reader = Elevateo::MailboxReads.new(cursor: @cursors)
    scope(identity: actor, write: false) do |connection|
      JSON.parse(reader.call(connection: connection, identity: actor, session: @envelope, query: {}))
        .fetch("items").map { |item| item.fetch("id") }
    end
  end
end
