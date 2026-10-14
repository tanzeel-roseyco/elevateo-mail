# frozen_string_literal: true

require_relative "../be_02/mailbox_membership_database_helper"

# AIDEV-NOTE: The protected actor projection is independent of which redacted grant page is visible.
class QA817GrantActorDatabaseTest < MailboxMembershipDatabaseCase
  # AIDEV-NOTE: These role-specific cases seed their own grants; inherited cleanup owns final-owner removal.
  def sec802_default_fixture?
    false
  end

  def setup
    super
    @sales = add_actor
    @auditor = add_actor
    [[@identity, "owner"], [@sales, "sales"], [@auditor, "auditor"]].each do |actor, role|
      @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,$3)",
        [@org, actor.user_id, role])
    end
  end

  def test_actor_remains_bound_across_redacted_pages
    first = grants_page(limit: 1)
    assert_equal "ok", first.fetch("status")
    assert_equal({ "user_id" => @user, "role" => "owner", "revision" => 0 }, first.fetch("actor"))
    refute_nil first.fetch("next_user_id")
    second = grants_page(after: first.fetch("next_user_id"), limit: 1)
    assert_equal first.fetch("actor"), second.fetch("actor")
    assert_equal 1, second.fetch("items").length
    assert(second.fetch("items").all? { |item| item.keys.sort == %w[revision role user_id] })
  end

  def test_nonadmin_cannot_read_actor_or_grants
    assert_equal "not_found", grants_page(actor: @auditor).fetch("status")
  end

  def test_forged_tenant_claim_cannot_read_actor_or_grants
    result = nil
    scope(write: false) do |connection|
      connection.execute("SET LOCAL app.org_id = '#{SecureRandom.uuid}'")
      result = call_page(connection, @identity, nil, 1)
    end
    assert_equal "not_found", result.fetch("status")
  end

  private

  def grants_page(actor: @identity, after: nil, limit: 50)
    scope(identity: actor, write: false) { |connection| call_page(connection, actor, after, limit) }
  end

  def call_page(connection, actor, after, limit)
    values = [actor.digest, after, limit]
    binds = values.map do |value|
      ActiveRecord::Relation::QueryAttribute.new("fixture", value, ActiveRecord::Type::String.new)
    end
    raw = connection.exec_query("SELECT app.organization_grants_page($1::text,$2::uuid,$3::integer) AS result",
      "QA817 grant actor", binds).first.fetch("result")
    raw.is_a?(String) ? JSON.parse(raw) : raw
  end
end
