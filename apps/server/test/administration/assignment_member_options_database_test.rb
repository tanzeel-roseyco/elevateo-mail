# frozen_string_literal: true

require_relative "../be_02/database_test_helper"

# AIDEV-NOTE: Synthetic Auth UUIDs and one disposable tenant prove the SQL read without binding staff roster rows.
class AssignmentMemberOptionsDatabaseTest < SessionDatabaseTestCase
  def setup
    super
    assert_equal "ok", create.fetch("status")
    @targets = []
    @boxes = []
    @box = add_box
    add_thread(@box)
  end

  def teardown
    @api&.exec("ROLLBACK") if @api && @api.transaction_status != PG::PQTRANS_IDLE
    @admin&.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    (@boxes || []).each { |box| @admin.exec_params("DELETE FROM app.mailboxes WHERE id = $1", [box]) }
    (@targets || []).each do |target|
      @admin.exec_params("DELETE FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2", [@org, target])
      @admin.exec_params("DELETE FROM app_auth.authorization_generations WHERE organization_id = $1 AND user_id = $2", [@org, target])
      @admin.exec_params("DELETE FROM auth.users WHERE id = $1", [target])
    end
    super
  end

  def add_box(visibility: "shared")
    box = SecureRandom.uuid
    @boxes << box
    @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES ($1,$2,$3,$4)",
      [box, @org, "#{box}@example.invalid", visibility])
    box
  end

  def add_thread(box)
    @admin.exec_params("INSERT INTO app.threads(id,organization_id,mailbox_id) VALUES ($1,$2,$3)",
      [SecureRandom.uuid, @org, box])
  end

  def add_target
    target = SecureRandom.uuid
    @targets << target
    @admin.exec_params("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [target, "#{target}@example.invalid"])
    @admin.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [@org, target])
    target
  end

  def join_private(box, user)
    @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id) VALUES ($1,$2,$3)",
      [@org, box, user])
  end

  def generation
    Integer(@admin.exec_params("SELECT generation FROM app_auth.authorization_generations WHERE organization_id=$1 AND user_id=$2",
      [@org, @user]).getvalue(0, 0), 10)
  end

  def page(box: @box, organization: @org, after: nil, limit: 50, user: @user,
    auth: @auth, context: @context, version: generation)
    @api.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    @api.exec_params("SELECT set_config('app.user_id',$1,true),set_config('app.org_id',$2,true)", [user, organization])
    JSON.parse(@api.exec_params(<<~SQL, [@digest, user, auth, context, version, organization, box, after, limit]).getvalue(0, 0))
      SELECT app.assignment_member_options($1::text,$2::uuid,$3::uuid,$4::uuid,$5::bigint,
        $6::uuid,$7::uuid,$8::uuid,$9::integer)
    SQL
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end

  def test_shared_keyset_is_sorted_bounded_and_redacted
    first_target = add_target
    second_target = add_target
    expected = [@user, first_target, second_target].sort
    first = page(limit: 2)
    assert_equal "ok", first.fetch("status")
    assert_equal expected.first(2).map { |id| { "user_id" => id } }, first.fetch("items")
    assert_equal expected[1], first.fetch("next_user_id")
    second = page(after: first.fetch("next_user_id"), limit: 2)
    assert_equal [{ "user_id" => expected[2] }], second.fetch("items")
    assert_nil second.fetch("next_user_id")
    assert_equal %w[items next_user_id status], first.keys.sort
    refute_match(/email|role|name|elev-person/, JSON.generate(first))
    assert_equal [], page(after: expected[2]).fetch("items")
    @admin.exec_params("DELETE FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2",
      [@org, second_target])
    refute_includes page.fetch("items"), { "user_id" => second_target }
  end

  def test_private_actor_and_target_match_existing_assignment_predicate
    box = add_box(visibility: "private")
    add_thread(box)
    target = add_target
    outsider = add_target
    assert_equal "not_found", page(box: box).fetch("status")
    join_private(box, @user)
    join_private(box, target)
    result = page(box: box)
    assert_equal [@user, target].sort.map { |id| { "user_id" => id } }, result.fetch("items")
    refute_includes result.fetch("items"), { "user_id" => outsider }
    @admin.exec_params("DELETE FROM app.mailbox_memberships WHERE mailbox_id=$1 AND user_id=$2", [box, target])
    assert_equal [{ "user_id" => @user }], page(box: box).fetch("items")
  end

  def test_foreign_absent_empty_and_revoked_authority_denies_without_enumeration
    foreign = SecureRandom.uuid
    assert_equal "not_found", page(box: foreign).fetch("status")
    assert_equal "not_found", page(organization: foreign).fetch("status")
    empty_box = add_box
    assert_equal "not_found", page(box: empty_box).fetch("status"), "no thread means no assignment write"
    @admin.exec_params("DELETE FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2", [@org, @user])
    assert_equal "not_found", page.fetch("status")
  end

  def test_stale_context_generation_invalid_limit_and_acl_are_denied
    assert_equal "context_changed", page(version: generation - 1).fetch("status")
    assert_equal "context_changed", page(context: SecureRandom.uuid).fetch("status")
    assert_equal "unauthorized", page(auth: SecureRandom.uuid).fetch("status")
    [0, 51].each do |limit|
      error = assert_raises(PG::InvalidParameterValue) { page(limit: limit) }
      assert_equal "22023", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
    end
    assert_equal "t", @admin.exec("SELECT has_function_privilege('elevateo_api',
      'app.assignment_member_options(text,uuid,uuid,uuid,bigint,uuid,uuid,uuid,integer)','EXECUTE')").getvalue(0, 0)
    %w[elevateo_worker elevateo_app_read].each do |role|
      assert_equal "f", @admin.exec_params("SELECT has_function_privilege($1,
        'app.assignment_member_options(text,uuid,uuid,uuid,bigint,uuid,uuid,uuid,integer)','EXECUTE')", [role]).getvalue(0, 0)
    end
    assert_equal "f", @admin.exec("SELECT has_table_privilege('elevateo_api','app.organization_access','SELECT')").getvalue(0, 0)
  end
end
