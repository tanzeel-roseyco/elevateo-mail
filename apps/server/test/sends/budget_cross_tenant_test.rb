# frozen_string_literal: true

require_relative "budget_database_helper"

# AIDEV-NOTE: One advisory-locked fixture owns both tenants; each has separate identities, sessions, logins and cleanup.
class SendBudgetCrossTenantTest < SendBudgetDatabaseTestCase
  def build_peer
    peer = SendBudgetDatabaseTestCase.new("peer_fixture")
    @peer = peer # AIDEV-NOTE: Retain partial initialization for teardown if any setup statement fails.
    { admin: ["BE02_ADMIN_DATABASE_URL", "supabase_admin"], api: ["BE02_API_DATABASE_URL", "elevateo_api"],
      worker: ["BE02_WORKER_DATABASE_URL", "elevateo_worker"] }.each do |name, args|
      peer.instance_variable_set("@#{name}", connect(*args))
    end
    %i[user auth org context box draft operation epoch].each { |name| peer.instance_variable_set("@#{name}", SecureRandom.uuid) }
    peer.instance_variable_set(:@digest, SecureRandom.hex(32))
    peer.instance_variable_set(:@owned_entries, [])
    peer.instance_variable_set(:@owned_buckets, [])
    admin, user, auth, org, box = %i[admin user auth org box].map { |name| peer.instance_variable_get("@#{name}") }
    admin.exec_params("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [user, "#{user}@example.invalid"])
    admin.exec_params("INSERT INTO auth.sessions(id,user_id,created_at) VALUES ($1,$2,clock_timestamp())", [auth, user])
    admin.exec_params("INSERT INTO app.organizations(id,name) VALUES ($1,'Second budget fixture')", [org])
    peer.membership(present: true)
    assert_equal "ok", peer.create.fetch("status")
    peer.fixture_change do
      admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES ($1,$2,$3,'private')", [box, org, "#{box}@example.invalid"])
      admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id,compose,approve_send) VALUES ($1,$2,$3,true,true)", [org, box, user])
      admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'owner')", [org, user])
      admin.exec_params("INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification) VALUES ($1,$2,'team')", [org, box])
      admin.exec_params("INSERT INTO app.mailbox_grant_ceilings(organization_id,mailbox_id,user_id,compose,manage_members) VALUES ($1,$2,$3,true,true)", [org, box, user])
      admin.exec_params("INSERT INTO app_send_private.organization_policy VALUES ($1,1,clock_timestamp())", [org])
      admin.exec_params("INSERT INTO app_send_private.mailbox_policy VALUES ($1,$2,true)", [org, box])
    end
    peer.create_smtp_account
    peer
  end

  def test_global_domain_budget_is_shared_by_independently_authorized_tenants
    peer = build_peer
    # AIDEV-NOTE: Refuse to alter a pre-existing shared limit; only this fixture's newly created limit is mutable.
    changed = @admin.exec_params("UPDATE app_send_private.budget_limits SET ceiling=1,version=version+1 WHERE kind='sender_domain' AND id=ANY($1::uuid[])", ["{#{@budget_limit_ids.join(',')}}"])
    assert_equal 1, changed.cmd_tuples
    pair = prepare_submission
    other = peer.prepare_submission
    @worker.exec("BEGIN")
    authorization = authorize(pair)
    refute_nil authorization
    second = peer.instance_variable_get(:@worker)
    thread = Thread.new { peer.authorize(other) }
    thread.report_on_exception = false
    wait_for_lock(second, blocker: @worker.backend_pid, seconds: 0.7)
    @worker.exec("COMMIT")
    assert thread.join(3), "second tenant worker failed to finish"
    assert_nil thread.value
    assert final_allowed(pair, authorization)
    assert_equal "counter_exhausted", @admin.exec_params("SELECT hold_reason FROM app_send_private.jobs WHERE send_id=$1", [other.last.send_id]).getvalue(0, 0)
    assert_equal "1", @admin.exec("SELECT count(*) FROM app_send_private.attempts").getvalue(0, 0)
    before = usage
    peer.teardown
    @peer = nil
    assert_equal before, usage, "peer disposal changed another tenant's shared quota or evidence"
    assert final_allowed(pair, authorization)
  ensure
    @worker.exec("ROLLBACK") if @worker && @worker.transaction_status != PG::PQTRANS_IDLE
    thread&.join(4)
  end

  def teardown
    @peer&.teardown
  ensure
    super
  end
end
