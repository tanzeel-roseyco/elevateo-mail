# frozen_string_literal: true

require_relative "draft_database_test_helper"

class DraftAuthorizationTest < DraftDatabaseTestCase
  def test_same_actor_in_two_organizations_cannot_cross_draft_or_reply_scope
    home = @org
    other, other_box, other_draft, reply = Array.new(4) { SecureRandom.uuid }
    @admin.exec_params("INSERT INTO app.organizations(id,name) VALUES ($1,'draft second organization')", [other])
    @org = other
    membership(present: true)
    fixture_change do
      @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES ($1,$2,$3,'private')", [other_box, other, "#{other_box}@example.invalid"])
      @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id,compose) VALUES ($1,$2,$3,true)", [other, other_box, @user])
    end
    @admin.exec_params("INSERT INTO app.threads(id,organization_id,mailbox_id) VALUES ($1,$2,$3)", [reply, other, other_box])
    @org = home
    switch_draft_organization(other)
    foreign = payload({ "mailbox_id" => other_box, "reply_to_thread_id" => reply }, draft: other_draft)
    assert_equal 1, save(foreign).fetch("version")
    switch_draft_organization(home)
    assert_equal 1, save.fetch("version")
    before = draft_scope_snapshot(home, other)
    assert_equal({ "code" => "not_available" }, save(foreign))
    assert_equal({ "code" => "not_available" }, lookup(box: other_box, draft: other_draft))
    assert_equal({ "code" => "not_available" }, save(payload("operation_id" => SecureRandom.uuid, "reply_to_thread_id" => reply)))
    assert_raises(PG::ForeignKeyViolation) do
      @admin.exec_params("UPDATE app.drafts SET reply_to_thread_id=$1 WHERE id=$2", [reply, @draft])
    end
    assert_equal before, draft_scope_snapshot(home, other)
  ensure
    if other
      @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
      @org = other
      @admin.exec_params("DELETE FROM app_drafts_private.operations WHERE organization_id=$1", [other])
      membership(present: false)
      @admin.exec_params("DELETE FROM app_auth.authorization_generations WHERE organization_id=$1", [other])
      @admin.exec_params("DELETE FROM app.organizations WHERE id=$1", [other])
    end
    @org = home
  end

  def switch_draft_organization(target)
    # AIDEV-NOTE: A real session switch keeps the same actor while changing both authorization context and RLS GUCs.
    generation = authorize.fetch("authorization_generation")
    context = SecureRandom.uuid
    result = invoke("switch_organization", @digest, @user, @auth, target, context, "next" * 12, @context, generation)
    assert_equal "ok", result.fetch("status")
    @org, @context = target, context
  end

  def draft_scope_snapshot(home, other)
    %w[app.drafts app_drafts_private.operations].map do |table|
      @admin.exec_params("SELECT * FROM #{table} WHERE organization_id IN ($1,$2) ORDER BY organization_id, #{table == 'app.drafts' ? 'id' : 'operation_id'}", [home, other]).to_a
    end
  end

  def test_api_cannot_mutate_directly_inspect_ledger_or_forge_guard_proof
    begin_write
    assert_raises(PG::InsufficientPrivilege) { save_sql(payload) }
    @api.exec("ROLLBACK")
    assert_empty ledger
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT * FROM app_drafts_private.operations") }
    assert_raises(PG::InsufficientPrivilege) { @api.exec("UPDATE app.drafts SET version = 1") }
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT app.compact_draft_operations(1)") }
    assert_raises(PG::InsufficientPrivilege) { @api.exec("UPDATE app.mailbox_memberships SET compose = true") }
    assert_equal 1, save.fetch("version")
    begin_write
    # AIDEV-NOTE: Committing the old marker makes it unusable in the next transaction, even with identical GUCs.
    assert_raises(PG::InsufficientPrivilege) { save_sql(payload) }
  end

  def test_existing_foreign_actor_draft_is_hidden_before_ledger_replay
    save
    @admin.exec_params("UPDATE app.drafts SET actor_id = $1 WHERE id = $2", [SecureRandom.uuid, @draft])
    assert_equal({ "code" => "not_available" }, save)
    assert_equal({ "code" => "not_available" }, lookup)
    begin_write
    assert_equal "0", @api.exec("SELECT count(*) FROM app.drafts").getvalue(0, 0)
    @api.exec("ROLLBACK")
    assert_equal 1, ledger.length
  end

  def test_compose_revocation_denies_current_read_and_retry_without_changing_ledger
    save
    original = ledger
    fixture_change do
      @admin.exec_params("UPDATE app.mailbox_memberships SET compose = false WHERE organization_id = $1 AND mailbox_id = $2 AND user_id = $3", [@org, @box, @user])
    end
    assert_equal({ "code" => "not_available" }, save)
    assert_equal({ "code" => "not_available" }, lookup)
    begin_write
    assert_equal "0", @api.exec("SELECT count(*) FROM app.drafts").getvalue(0, 0)
    @api.exec("ROLLBACK")
    assert_equal original, ledger
  end

  def test_database_enforces_unicode_maxima_and_composite_reply_scope
    value = payload("subject" => "\u{1F48C}" * 998, "body_text" => "\u0001" * 65_536,
      "to" => [{ "display_name" => "\u{1F48C}" * 256, "address" => nil }] * 100)
    assert_equal 1, save(value).fetch("version")
    assert_equal value.body_text, draft_row.fetch("body_text")
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("UPDATE app.drafts SET subject = $1 WHERE id = $2", ["\u{1F48C}" * 999, @draft])
    end
    assert_raises(PG::CheckViolation) { @admin.exec_params("UPDATE app.drafts SET version = 0 WHERE id = $1", [@draft]) }
    assert_raises(PG::ForeignKeyViolation) do
      @admin.exec_params("UPDATE app.drafts SET reply_to_thread_id = $1 WHERE id = $2", [SecureRandom.uuid, @draft])
    end
    row = @admin.exec("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'app.drafts'::regclass").first
    assert_equal({ "relrowsecurity" => "t", "relforcerowsecurity" => "t" }, row)
  end

  def test_other_mailbox_reply_and_shared_read_without_compose_remain_unavailable
    other_box, reply = SecureRandom.uuid, SecureRandom.uuid
    fixture_change do
      @admin.exec_params("INSERT INTO app.mailboxes(id, organization_id, address, visibility) VALUES ($1, $2, $3, 'shared')",
        [other_box, @org, "#{other_box}@example.invalid"])
    end
    @admin.exec_params("INSERT INTO app.threads(id, organization_id, mailbox_id) VALUES ($1, $2, $3)", [reply, @org, other_box])
    assert_equal({ "code" => "not_available" }, save(payload("reply_to_thread_id" => reply)))
    assert_equal({ "code" => "not_available" }, save(payload("mailbox_id" => other_box)))
    assert_equal({ "code" => "not_available" }, lookup(box: other_box))
    assert_empty ledger
    assert_nil draft_row
    assert_equal 1, save.fetch("version")
    assert_raises(PG::ForeignKeyViolation) do
      @admin.exec_params("UPDATE app.drafts SET reply_to_thread_id = $1 WHERE id = $2", [reply, @draft])
    end
  end
end
