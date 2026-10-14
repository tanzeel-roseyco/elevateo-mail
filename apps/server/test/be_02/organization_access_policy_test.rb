# frozen_string_literal: true

require_relative "organization_access_database_test"

class OrganizationAccessPolicyTest < MailboxMembershipDatabaseCase
  def sec802_default_fixture?
    false
  end

  def grant(actor, role)
    @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,$3)",
      [@org, actor.user_id, role])
  end

  def setup
    super
    grant(@identity, "owner")
    classify(@box, "team")
    ceiling(@identity, compose: true, manage: true)
  end

  def classify(box, kind, owner: nil)
    @admin.exec_params(<<~SQL, [@org, box, kind, owner])
      INSERT INTO app.mailbox_security(organization_id, mailbox_id, classification, personal_owner_id)
        VALUES ($1,$2,$3,$4)
    SQL
  end

  def ceiling(actor, compose: false, approve: false, manage: false)
    @admin.exec_params(<<~SQL, [@org, @box, actor.user_id, compose, approve, manage])
      INSERT INTO app.mailbox_grant_ceilings(organization_id, mailbox_id, user_id, compose, approve_send, manage_members)
        VALUES ($1,$2,$3,$4,$5,$6)
    SQL
  end

  def grants_page(actor: @identity, after: nil, limit: 50)
    result = nil
    scope(identity: actor, write: false) do |connection|
      sql = "SELECT app.organization_grants_page($1,$2,$3) AS result"
      values = [actor.digest, after, limit]
      binds = values.map { |value| ActiveRecord::Relation::QueryAttribute.new("fixture", value, ActiveRecord::Type::String.new) }
      raw = connection.exec_query(sql, "Grant read fixture", binds).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
    end
    result
  end

  def audit_status(actor)
    result = nil
    scope(identity: actor, write: false) do |connection|
      bind = ActiveRecord::Relation::QueryAttribute.new("fixture", actor.digest, ActiveRecord::Type::String.new)
      raw = connection.exec_query("SELECT app.organization_role_audit_page($1,NULL::uuid,50) AS result",
        "Audit denial fixture", [bind]).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
    end
    result.fetch("status")
  end

  def role_change(actor, target, expected, role)
    result = nil
    scope(identity: actor, targets: [target.user_id]) do |connection|
      values = [actor.digest, target.user_id, expected.to_s, role]
      binds = values.map { |value| ActiveRecord::Relation::QueryAttribute.new("fixture", value, ActiveRecord::Type::String.new) }
      raw = connection.exec_query("SELECT app.change_organization_role($1,$2,$3,$4) AS result",
        "Role policy fixture", binds).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
      raise ActiveRecord::Rollback unless result.fetch("status") == "ok"
    end
    result
  end

  def test_role_demotion_cannot_strand_sole_effective_team_manager
    manager = add_actor
    grant(manager, "admin")
    explicit_member(manager, manager: true)
    ceiling(manager, compose: true, manage: true)
    assert_equal "ok", raw_change(@user, revision, flags: nil).fetch("status")
    assert_equal "role_conflict", role_change(@identity, manager, 0, "associate").fetch("status")
    assert_equal "admin", @admin.exec_params("SELECT role FROM app.organization_access WHERE user_id=$1", [manager.user_id]).getvalue(0, 0)
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app.organization_role_audit WHERE organization_id=$1", [@org]).getvalue(0, 0)
  end

  def outreach_authorization(actor)
    result = nil
    scope(identity: actor, targets: [actor.user_id]) do |connection|
      bind = ActiveRecord::Relation::QueryAttribute.new("fixture", actor.digest, ActiveRecord::Type::String.new)
      raw = connection.exec_query("SELECT app.authorize_outreach_draft_write($1) AS result",
        "Outreach authority fixture", [bind]).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
    end
    result
  end

  def outreach_read_authorization(actor)
    result = nil
    scope(identity: actor, write: false) do |connection|
      bind = ActiveRecord::Relation::QueryAttribute.new("fixture", actor.digest, ActiveRecord::Type::String.new)
      raw = connection.exec_query("SELECT app.authorize_outreach_content_read($1) AS result",
        "Outreach read authority fixture", [bind]).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
    end
    result
  end

  def test_outreach_draft_write_requires_current_business_role
    sales = add_actor
    grant(sales, "sales")
    auditor = add_actor
    grant(auditor, "auditor")
    assert_equal "ok", outreach_authorization(sales).fetch("status")
    assert_equal "ok", outreach_read_authorization(sales).fetch("status")
    assert_equal "not_found", outreach_authorization(auditor).fetch("status")
    assert_equal "not_found", outreach_read_authorization(auditor).fetch("status")
    assert_equal "ok", outreach_authorization(@identity).fetch("status")
  end

  def test_owner_can_delegate_with_explicit_ceiling_and_read_redacted_grants
    target = add_actor
    grant(target, "associate")
    response = raw_change(target.user_id, revision, flags: FLAGS)
    assert_equal "ok", response.fetch("status")
    page = grants_page
    assert_equal "ok", page.fetch("status")
    assert_equal({ "user_id" => @user, "role" => "owner", "revision" => 0 }, page.fetch("actor"))
    assert_equal [@user, target.user_id].sort, page.fetch("items").map { |row| row.fetch("user_id") }.sort
    assert(page.fetch("items").all? { |row| row.keys.sort == %w[revision role user_id] })
    assert_nil page.fetch("next_user_id")
  end

  def test_grant_page_uses_uuid_cursor_and_does_not_cross_tenant
    users = Array.new(2) { add_actor }
    users.each { |actor| grant(actor, "associate") }
    first = grants_page(limit: 1)
    assert_equal 1, first.fetch("items").length
    refute_nil first.fetch("next_user_id")
    second = grants_page(after: first.fetch("next_user_id"), limit: 1)
    assert_equal 1, second.fetch("items").length
    refute_equal first.fetch("items").first.fetch("user_id"), second.fetch("items").first.fetch("user_id")
  end

  def test_legacy_mutation_denies_grant_above_ceiling_and_self_promotion
    target = add_actor
    grant(target, "associate")
    before = revision
    assert_equal "not_found", raw_change(target.user_id, before,
      flags: FLAGS.merge("approve_send" => true)).fetch("status")
    assert_equal "not_found", raw_change(@user, before,
      flags: FLAGS.merge("manage_members" => true, "approve_send" => true)).fetch("status")
    assert_equal before, revision
  end

  def test_personal_owner_consent_blocks_other_manager_even_with_ceiling
    fixture_change(@org) do
      @admin.exec_params("UPDATE app.mailboxes SET visibility='private' WHERE id=$1", [@box])
    end
    @admin.exec_params("DELETE FROM app.mailbox_security WHERE mailbox_id=$1", [@box])
    classify(@box, "personal", owner: @user)
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("UPDATE app.mailboxes SET visibility='shared' WHERE id=$1", [@box])
    end
    other = add_actor
    grant(other, "admin")
    explicit_member(other, manager: true)
    ceiling(other, compose: true, manage: true)
    target = add_actor
    grant(target, "associate")
    assert_equal "not_found", raw_change(target.user_id, revision, identity: other).fetch("status")
    assert_equal "membership_conflict", raw_change(@user, revision, flags: nil).fetch("status")
    assert_equal "not_found", raw_change(target.user_id, revision,
      flags: FLAGS.merge("manage_members" => true)).fetch("status")
    assert_equal "ok", raw_change(target.user_id, revision).fetch("status")
  end

  def test_personal_owner_can_consent_without_organization_admin_role
    personal = add_actor
    grant(personal, "associate")
    @box = mailbox(visibility: "private")
    explicit_member(personal, manager: true)
    ceiling(personal, compose: true, manage: true)
    classify(@box, "personal", owner: personal.user_id)
    target = add_actor
    grant(target, "associate")
    assert_equal "ok", raw_change(target.user_id, revision, identity: personal).fetch("status")
    assert_equal "not_found", raw_change(target.user_id, revision, identity: @identity).fetch("status")
  end

  def test_two_manager_departures_preserve_one_current_manager
    other = add_actor
    grant(other, "admin")
    explicit_member(other, manager: true)
    ceiling(other, compose: true, manage: true)
    before = revision
    results = parallel_services(2) do |index|
      actor = [@identity, other].fetch(index)
      raw_change(actor.user_id, before, flags: nil, identity: actor)
    end
    assert_equal %w[membership_conflict ok], results.map { |row| row.fetch("status") }.sort
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM app.mailbox_memberships WHERE mailbox_id=$1 AND manage_members", [@box]).getvalue(0, 0)
  end

  def test_role_revocation_before_waiting_legacy_write_denies_stale_actor
    manager = add_actor
    grant(manager, "admin")
    explicit_member(manager, manager: true)
    ceiling(manager, compose: true, manage: true)
    target = add_actor
    grant(target, "associate")
    expected = revision
    membership_race do |workers, deadline|
      waiter = nil
      member_change(manager.user_id) do |connection|
        connection.exec_params("UPDATE app.organization_access SET role='associate', revision=revision+1 WHERE organization_id=$1 AND user_id=$2", [@org, manager.user_id])
        blocker = connection.backend_pid
        waiter, ready = membership_worker(workers) { raw_change(target.user_id, expected, identity: manager) }
        pid = membership_pid(waiter, ready, deadline)
        membership_lock_wait(waiter, pid, blocker, "begin_protected_write", deadline)
      end
      assert_equal "not_found", membership_result(waiter, deadline).fetch("status")
    end
    assert_equal expected, revision
  end

  def test_unclassified_mailbox_fails_closed_and_api_cannot_edit_policy_tables
    target = add_actor
    grant(target, "associate")
    before = revision
    @admin.exec_params("DELETE FROM app.mailbox_security WHERE mailbox_id=$1", [@box])
    assert_equal "not_found", raw_change(target.user_id, before).fetch("status")
    assert_equal before, revision
    %w[organization_access mailbox_security mailbox_grant_ceilings].each do |table|
      assert_raises(PG::InsufficientPrivilege) { @api.exec("DELETE FROM app.#{table}") }
    end
    assert_raises(PG::InsufficientPrivilege) do
      @api.exec_params("SELECT app.enroll_verified_organization_grant($1,$2,'owner','SEC802-TEST-RECEIPT')", [@org, @user])
    end
  end

  def test_forged_tenant_context_cannot_read_grants
    scope(write: false) do |connection|
      connection.execute("SET LOCAL app.org_id = '#{SecureRandom.uuid}'")
      sql = "SELECT app.organization_grants_page($1::text,NULL::uuid,50) AS result"
      bind = ActiveRecord::Relation::QueryAttribute.new("fixture", @digest, ActiveRecord::Type::String.new)
      raw = connection.exec_query(sql, "Forged context", [bind]).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
      assert_equal "not_found", result.fetch("status")
      raw_read = connection.exec_query("SELECT app.authorize_outreach_content_read($1::text) AS result",
        "Forged outreach context", [bind]).first.fetch("result")
      read_result = raw_read.is_a?(String) ? JSON.parse(raw_read) : raw_read
      assert_equal "not_found", read_result.fetch("status")
    end
  end

  def test_foreign_grants_never_appear_in_page
    foreign_org, = foreign_witness
    foreign_actor = add_actor
    fixture_change(foreign_org) do
      @admin.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [foreign_org, foreign_actor.user_id])
    end
    @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'admin')", [foreign_org, foreign_actor.user_id])
    refute_includes grants_page.fetch("items").map { |item| item.fetch("user_id") }, foreign_actor.user_id
  end

  def test_auditor_reads_only_audit_and_associate_reads_neither
    other = add_actor
    grant(other, "auditor")
    assert_equal "not_found", grants_page(actor: other).fetch("status")
    assert_equal "ok", audit_status(other)
    associate = add_actor
    grant(associate, "associate")
    assert_equal "not_found", grants_page(actor: associate).fetch("status")
    assert_equal "not_found", audit_status(associate)
  end
end
