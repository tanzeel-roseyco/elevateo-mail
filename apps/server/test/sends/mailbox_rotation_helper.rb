# frozen_string_literal: true

require_relative "approval_database_helper"

# AIDEV-NOTE: Jobs enter through actual draft approval; admin authority only provisions isolated test mailboxes.
class MailboxRotationTestCase < SendDatabaseTestCase
  def add_box
    id = SecureRandom.uuid
    fixture_change do
      @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES ($1,$2,$3,'private')", [id, @org, "#{id}@example.invalid"])
      @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id,compose,approve_send) VALUES ($1,$2,$3,true,true)", [@org, id, @user])
      @admin.exec_params("INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification) VALUES ($1,$2,'team')", [@org, id])
      @admin.exec_params("INSERT INTO app.mailbox_grant_ceilings(organization_id,mailbox_id,user_id,compose,manage_members) VALUES ($1,$2,$3,true,true)", [@org, id, @user])
      @admin.exec_params("INSERT INTO app_send_private.mailbox_policy VALUES ($1,$2,true)", [@org, id])
    end
    id
  end

  def enqueue(box = @box)
    @box, @draft, @operation = box, SecureRandom.uuid, SecureRandom.uuid
    @saved = payload(subject: "rotation", body_text: "body", to: [{ "display_name" => nil, "address" => "Recipient@example.invalid" }])
    assert_equal 1, save(@saved).fetch("version")
    @bytes = snapshot
    @review_digest = Digest::SHA256.hexdigest(@bytes)
    approve.fetch("send_id")
  end

  def due(excluded: [], epoch: @epoch, connection: @worker)
    connection.exec_params("SELECT app_send_private.next_due_send($1::uuid,$2::uuid[])", [epoch, "{#{excluded.join(',')}}"]).getvalue(0, 0)
  end

  def make_older(send_id)
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp()-interval '1 hour' WHERE send_id=$1", [send_id])
  end

  def rotation_rows
    @admin.exec_params("SELECT mailbox_id,last_turn FROM app_send_private.mailbox_schedule WHERE organization_id=$1 ORDER BY mailbox_id", [@org]).to_a
  end

  def rotation_root
    File.expand_path("../../db/be03_send", __dir__)
  end
end
