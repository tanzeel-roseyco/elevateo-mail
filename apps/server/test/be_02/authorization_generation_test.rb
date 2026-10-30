# frozen_string_literal: true

require_relative "database_test_helper"

# AIDEV-NOTE: Four existing tombstones expose Cartesian over-invalidation when both membership keys change.
class AuthorizationGenerationTest < SessionDatabaseTestCase
  def setup
    super
    @other_org, @other_user = SecureRandom.uuid, SecureRandom.uuid
    @pairs = [@org, @other_org].product([@user, @other_user])
    # The base teardown rolls this transaction back before removing its committed fixture.
    @admin.exec("BEGIN")
    @admin.exec_params("INSERT INTO app.organizations(id, name) VALUES ($1, 'Generation fixture')", [@other_org])
    @pairs.sort.each do |pair|
      @admin.exec_params("INSERT INTO app_auth.authorization_generations(organization_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", pair)
      @admin.exec_params("SELECT app_auth.lock_authorization_generations($1, $2)", pair)
    end
    assert_equal 4, generations.length
  end

  def test_organization_membership_move_bumps_only_exact_old_and_new_pairs
    assert_bumps([[@org, @user], [@other_org, @other_user]]) do
      @admin.exec_params("UPDATE app.organization_memberships SET organization_id = $3, user_id = $4 WHERE organization_id = $1 AND user_id = $2",
        [@org, @user, @other_org, @other_user])
    end
  end

  def test_organization_only_move_preserves_other_users
    assert_bumps([[@org, @user], [@other_org, @user]]) do
      @admin.exec_params("UPDATE app.organization_memberships SET organization_id = $3 WHERE organization_id = $1 AND user_id = $2",
        [@org, @user, @other_org])
    end
  end

  def test_user_only_move_preserves_other_organizations
    assert_bumps([[@org, @user], [@org, @other_user]]) do
      @admin.exec_params("UPDATE app.organization_memberships SET user_id = $3 WHERE organization_id = $1 AND user_id = $2",
        [@org, @user, @other_user])
    end
  end

  def test_delete_and_readd_preserve_the_tombstone_and_advance_each_time
    pair = [@org, @user]
    original = generations.fetch(pair)
    assert_bumps([pair]) do
      @admin.exec_params("DELETE FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2", pair)
    end
    assert_bumps([pair]) do
      @admin.exec_params("INSERT INTO app.organization_memberships(organization_id, user_id) VALUES ($1, $2)", pair)
    end
    assert_equal original + 2, generations.fetch(pair)
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app_auth.sessions WHERE user_id = $1", [@user]).getvalue(0, 0)
  end

  def test_mailbox_membership_move_bumps_exact_pairs_without_cross_pair_changes
    source, target = mailbox_membership_fixture
    assert_bumps([[@org, @user], [@other_org, @other_user]]) do
      @admin.exec_params("UPDATE app.mailbox_memberships SET organization_id = $3, mailbox_id = $4, user_id = $5 WHERE mailbox_id = $1 AND user_id = $2",
        [source, @user, @other_org, target, @other_user])
    end
  end

  def test_mailbox_capability_update_and_delete_readd_bump_one_pair_once_each
    source, = mailbox_membership_fixture
    pair = [@org, @user]
    assert_bumps([pair]) do
      @admin.exec_params("UPDATE app.mailbox_memberships SET compose = true WHERE mailbox_id = $1 AND user_id = $2", [source, @user])
    end
    assert_bumps([pair]) do
      @admin.exec_params("DELETE FROM app.mailbox_memberships WHERE mailbox_id = $1 AND user_id = $2", [source, @user])
    end
    assert_bumps([pair]) do
      @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id, mailbox_id, user_id) VALUES ($1, $2, $3)", [@org, source, @user])
    end
  end

  def test_mailbox_changes_keep_whole_organization_invalidation
    mailbox = SecureRandom.uuid
    first_org = @pairs.select { |org, _user| org == @org }
    second_org = @pairs.select { |org, _user| org == @other_org }
    assert_bumps(first_org) { insert_mailbox(mailbox, @org) }
    assert_bumps(first_org) do
      @admin.exec_params("UPDATE app.mailboxes SET visibility = 'private' WHERE id = $1", [mailbox])
    end
    assert_bumps(@pairs) do
      @admin.exec_params("UPDATE app.mailboxes SET organization_id = $2 WHERE id = $1", [mailbox, @other_org])
    end
    assert_bumps(second_org) { @admin.exec_params("DELETE FROM app.mailboxes WHERE id = $1", [mailbox]) }
  end

  private

  def generations
    @admin.exec_params("SELECT organization_id, user_id, generation FROM app_auth.authorization_generations WHERE organization_id IN ($1, $2)",
      [@org, @other_org]).to_h { |row| [[row.fetch("organization_id"), row.fetch("user_id")], row.fetch("generation").to_i] }
  end

  def assert_bumps(pairs)
    before = generations
    yield
    expected = before.merge(pairs.to_h { |pair| [pair, before.fetch(pair) + 1] })
    assert_equal expected, generations, "only the affected tuples may advance, exactly once per row change"
  end

  def insert_mailbox(id, org)
    @admin.exec_params("INSERT INTO app.mailboxes(id, organization_id, address, visibility) VALUES ($1, $2, $3, 'shared')",
      [id, org, "#{id}@example.invalid"])
  end

  def mailbox_membership_fixture
    @pairs.each do |pair|
      @admin.exec_params("INSERT INTO app.organization_memberships(organization_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", pair)
    end
    source, target = SecureRandom.uuid, SecureRandom.uuid
    insert_mailbox(source, @org)
    insert_mailbox(target, @other_org)
    @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id, mailbox_id, user_id) VALUES ($1, $2, $3)", [@org, source, @user])
    [source, target]
  end
end
