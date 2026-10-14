# frozen_string_literal: true

require "minitest/autorun"
require "pg"
require "securerandom"

# AIDEV-NOTE: Soren runs this only against a named disposable fleet DB after migration 00009.
class CampaignDatabaseTest < Minitest::Test
  def setup
    @admin = connect("OUT804_ADMIN_DATABASE_URL", "supabase_admin")
    @api = connect("OUT804_API_DATABASE_URL", "elevateo_api")
    @org, @other_org, @user, @other_user = Array.new(4) { SecureRandom.uuid }
    @campaign, @private_box, @account = Array.new(3) { SecureRandom.uuid }
    [@org, @other_org].each { |org| @admin.exec_params("INSERT INTO app.organizations(id,name) VALUES ($1,'OUT804 disposable')", [org]) }
    @admin.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [@org, @user])
    @admin.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [@other_org, @other_user])
    @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES ($1,$2,$3,'private')",
      [@private_box, @org, "#{@private_box}@example.invalid"])
  end

  def teardown
    @api&.exec("ROLLBACK") if @api && @api.transaction_status != PG::PQTRANS_IDLE
    if @admin && @org
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      [@org, @other_org].each { |org| @admin.exec_params("DELETE FROM app.organizations WHERE id=$1", [org]) }
    end
  ensure
    @api&.close unless @api&.finished?
    @admin&.close unless @admin&.finished?
  end

  def connect(variable, expected_user)
    url = ENV.fetch(variable)
    expected_database = ENV.fetch("OUT804_TASK_DATABASE_NAME")
    raise "empty disposable database name" if expected_database.empty?
    connection = PG.connect(url)
    identity = connection.exec("SELECT session_user,current_database()").first
    raise "wrong database or role" unless identity.values_at("session_user", "current_database") == [expected_user, expected_database]
    connection.exec("SET statement_timeout='3s'; SET lock_timeout='1s'")
    connection
  end

  def claims(user, org)
    @api.exec("BEGIN")
    @api.exec_params("SELECT set_config('app.user_id',$1,true),set_config('app.org_id',$2,true)", [user, org])
  end

  def test_own_tenant_create_and_other_tenant_absence
    claims(@user, @org)
    @api.exec_params("INSERT INTO app.campaigns(id,organization_id,operation_id,name,status) VALUES ($1,$2,$3,'Pilot','draft')",
      [@campaign, @org, SecureRandom.uuid])
    assert_equal "1", @api.exec_params("SELECT count(*) FROM app.campaigns WHERE id=$1", [@campaign]).getvalue(0, 0)
    @api.exec("COMMIT")
    claims(@other_user, @other_org)
    assert_equal "0", @api.exec_params("SELECT count(*) FROM app.campaigns WHERE id=$1", [@campaign]).getvalue(0, 0)
    @api.exec("ROLLBACK")
    assert_equal "0", @api.exec("SELECT count(*) FROM app.campaigns").getvalue(0, 0)
  end

  def test_cross_tenant_insert_is_denied_even_with_known_organization_id
    claims(@other_user, @other_org)
    assert_raises(PG::InsufficientPrivilege) do
      @api.exec_params("INSERT INTO app.campaigns(id,organization_id,operation_id,name,status) VALUES ($1,$2,$3,'Cross','draft')",
        [@campaign, @org, SecureRandom.uuid])
    end
  end

  def test_private_mailbox_without_membership_cannot_be_linked
    claims(@user, @org)
    @api.exec_params("INSERT INTO app.campaigns(id,organization_id,operation_id,name,status) VALUES ($1,$2,$3,'Pilot','draft')",
      [@campaign, @org, SecureRandom.uuid])
    @api.exec("SAVEPOINT account_attempt")
    assert_raises(PG::InsufficientPrivilege) do
      @api.exec_params(<<~SQL, [@account, @org, @campaign, @private_box, SecureRandom.uuid])
        INSERT INTO app.campaign_accounts(id,organization_id,campaign_id,mailbox_id,operation_id,label)
        VALUES ($1,$2,$3,$4,$5,'Private')
      SQL
    end
    @api.exec("ROLLBACK TO SAVEPOINT account_attempt")
    assert_equal "0", @api.exec("SELECT count(*) FROM app.campaign_accounts").getvalue(0, 0)
  end

  def test_storage_is_inert_and_rls_forced
    rows = @admin.exec(<<~SQL).to_a
      SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE relnamespace='app'::regnamespace AND relname IN
        ('campaigns','campaign_leads','campaign_accounts','campaign_suppressions','campaign_mutations')
    SQL
    assert_equal 5, rows.length
    assert(rows.all? { |row| row.values_at("relrowsecurity", "relforcerowsecurity") == %w[t t] })
    assert_equal "f", @admin.exec("SELECT has_table_privilege('elevateo_worker','app.campaigns','INSERT')").getvalue(0, 0)
  end
end
