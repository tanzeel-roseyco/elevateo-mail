# frozen_string_literal: true

# AIDEV-NOTE: A parent fixture owns the advisory test lock; peers use independent tenant identities and logins.
module AuthorizedPeerFixture
  def build_send_peer(fixture_class)
    peer = fixture_class.new("peer_fixture")
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
    admin.exec_params("INSERT INTO app.organizations(id,name) VALUES ($1,'Second send fixture')", [org])
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
    peer
  end

end
