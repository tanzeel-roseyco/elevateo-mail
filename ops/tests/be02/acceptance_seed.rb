# frozen_string_literal: true

require_relative "acceptance_seed_support"

module Be02Acceptance
  # AIDEV-NOTE: Auth owns user creation; app rows use existing migrations, triggers and the real version signer.
  class Fixture
    def initialize(runtime)
      @runtime, @seed, @rows = runtime, runtime.seed, []
      @actors, @data = @seed.fetch("actors"), @seed.fetch("data")
    end

    def run
      @db = @runtime.database
      Be02Acceptance.check(@db.exec("SELECT count(*) FROM auth.users WHERE email LIKE '%@acceptance.test'").getvalue(0, 0) == "0",
        "fresh_auth_fixture_required")
      @runtime.create_users
      @db.transaction do
        seed_scopes
        seed_memberships
        seed_content
      end
      # AIDEV-NOTE: Verify committed rows in a new snapshot; API/browser consumers must remain stopped until exit 0.
      @db.transaction do
        verify_rows
        verify_actors
      end
      @runtime.publish
    ensure
      @db&.close
    end

    private

    def insert(table, row, remember: true)
      columns = row.keys.map { |key| PG::Connection.quote_ident(key.to_s) }
      placeholders = row.each_key.with_index.map { |_, index| "$#{index + 1}" }
      @db.exec_params("INSERT INTO #{table} (#{columns.join(',')}) VALUES (#{placeholders.join(',')})", row.values)
      @rows << [table, row] if remember
    end

    def seed_scopes
      %w[primary other].each do |scope|
        org, box = scope_ids(scope)
        insert("app.organizations", { id: org, name: "Acceptance #{scope}" })
        insert("app.mailboxes", { id: box, organization_id: org, address: "#{scope}@acceptance.test",
          display_name: "Acceptance #{scope}", display_address: "#{scope}@acceptance.test", visibility: "private" })
      end
    end

    def seed_memberships
      @actors.each do |name, actor|
        next if name == "no_membership"
        org, box = scope_ids(actor.fetch("organization"))
        user = actor.fetch("user_id")
        @db.exec_params("SELECT app_auth.lock_authorization_generations($1,$2)", [org, user])
        insert("app.organization_memberships", { organization_id: org, user_id: user })
        next if name == "disabled"
        caps = actor.fetch("capabilities")
        membership = { organization_id: org, mailbox_id: box, user_id: user,
          compose: caps.include?("compose"), approve_send: caps.include?("approve_send"), manage_members: caps.include?("manage") }
        if name == "revoked"
          # AIDEV-NOTE: Exercise removal/readdition through real triggers; final private-mailbox access stays revoked.
          before = generation(org, user)
          2.times do
            insert("app.mailbox_memberships", membership, remember: false)
            @db.exec_params("DELETE FROM app.mailbox_memberships WHERE mailbox_id=$1 AND user_id=$2", [box, user])
          end
          Be02Acceptance.check(generation(org, user) == before + 4, "revocation_generation_not_advanced")
        else
          insert("app.mailbox_memberships", membership)
        end
      end
    end

    def seed_content
      %w[primary other].each do |scope|
        org, box = scope_ids(scope)
        thread, draft = @data.fetch("thread_#{scope}"), @data.fetch("draft_#{scope}")
        owner = @actors.fetch(scope == "primary" ? "composer" : "other_org").fetch("user_id")
        at, marker = @data.fetch("ordered_at"), @data.fetch("marker")
        insert("app.threads", { id: thread, organization_id: org, mailbox_id: box,
          subject: "#{marker} #{scope}", created_at: at })
        insert("app.messages", { id: SecureRandom.uuid, organization_id: org, mailbox_id: box, thread_id: thread,
          sender: JSON.generate(display_name: "Synthetic sender", address: "sender@acceptance.test"),
          recipients: "[]", sent_at: at, body_text: "#{marker}\nPlain text <b>remains literal</b> #{scope}",
          attachment_count: 0, created_at: at })
        # AIDEV-NOTE: Model a historical draft by granting then removing compose; final RLS must hide it from its owner.
        if scope == "other"
          prior_generation = generation(org, owner)
          @db.exec_params("UPDATE app.mailbox_memberships SET compose=true WHERE mailbox_id=$1 AND user_id=$2", [box, owner])
        end
        insert("app.drafts", { id: draft, organization_id: org, mailbox_id: box, actor_id: owner,
          subject: "#{marker} draft #{scope}", recipients: "[]", body_text: "#{marker} private draft #{scope}",
          reply_to_thread_id: thread, version: @data.fetch("draft_version"), state: "editable", created_at: at, updated_at: at })
        if scope == "other"
          @db.exec_params("UPDATE app.mailbox_memberships SET compose=false WHERE mailbox_id=$1 AND user_id=$2", [box, owner])
          Be02Acceptance.check(generation(org, owner) == prior_generation + 2, "draft_owner_generation_not_advanced")
        end
        insert("app.thread_assignments", { organization_id: org, mailbox_id: box, thread_id: thread,
          assignee_id: nil, assignment_version: 0, updated_at: nil })
        author = @actors.fetch(scope == "primary" ? "manager_primary" : "other_org").fetch("user_id")
        insert("app.thread_notes", { organization_id: org, id: SecureRandom.uuid, mailbox_id: box,
          thread_id: thread, author_id: author, body_text: "#{marker} known note #{scope}", version: 1, created_at: at })
      end
      org, box = scope_ids("primary")
      insert("app.thread_read_states", { organization_id: org, mailbox_id: box, thread_id: @data.fetch("thread_primary"),
        user_id: @actors.fetch("manager_backup").fetch("user_id"), is_read: true,
        read_state_version: 1, updated_at: @data.fetch("ordered_at") })
    end

    def verify_rows
      @rows.each do |table, row|
        predicates = row.each_key.with_index.map { |key, index| "#{PG::Connection.quote_ident(key.to_s)} IS NOT DISTINCT FROM $#{index + 1}" }
        count = @db.exec_params("SELECT count(*) FROM #{table} WHERE #{predicates.join(' AND ')}", row.values).getvalue(0, 0)
        Be02Acceptance.check(count == "1", "committed_fixture_mismatch")
      end
    end

    def verify_actors
      @actors.each do |name, actor|
        user = actor.fetch("user_id")
        auth = @db.exec_params(<<~SQL, [user, actor.fetch("email")]).first
          SELECT (u.banned_until > clock_timestamp()) IS TRUE AS banned,
            EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND i.provider='email') AS identity,
            EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id) AS auth_session,
            EXISTS (SELECT 1 FROM app_auth.sessions s WHERE s.user_id=u.id) AS app_session
          FROM auth.users u WHERE u.id=$1 AND u.email=$2 AND u.email_confirmed_at IS NOT NULL
            AND u.encrypted_password <> '' AND u.role='authenticated' AND u.aud='authenticated'
        SQL
        Be02Acceptance.check(auth && auth.fetch("banned") == (name == "disabled" ? "t" : "f") &&
          auth.fetch("identity") == "t" && auth.fetch("auth_session") == "f" && auth.fetch("app_session") == "f", "auth_identity_mismatch")
        org, box = actor["organization"] ? scope_ids(actor.fetch("organization")) : [nil, nil]
        memberships = @db.exec_params("SELECT organization_id FROM app.organization_memberships WHERE user_id=$1", [user]).column_values(0)
        Be02Acceptance.check(memberships == (org ? [org] : []), "organization_membership_mismatch")
        rows = @db.exec_params("SELECT organization_id,mailbox_id,compose,approve_send,manage_members FROM app.mailbox_memberships WHERE user_id=$1", [user]).to_a
        actual = []
        unless rows.empty?
          Be02Acceptance.check(rows.length == 1 && rows[0].fetch("organization_id") == org && rows[0].fetch("mailbox_id") == box,
            "mailbox_membership_mismatch")
          actual << "read"
          { "compose" => "compose", "approve_send" => "approve_send", "manage_members" => "manage" }.each do |column, capability|
            actual << capability if rows[0].fetch(column) == "t"
          end
        end
        Be02Acceptance.check(actual.sort == actor.fetch("capabilities").sort, "effective_capabilities_mismatch")
        actor["capabilities"] = actual
        actor["membership_generation"] = nil
        actor["authorization_version"] = if org && name != "disabled"
          @runtime.presentation.version("user_id" => user, "organization_id" => org, "authorization_generation" => generation(org, user))
        end
      end
    end

    def generation(org, user)
      rows = @db.exec_params("SELECT generation FROM app_auth.authorization_generations WHERE organization_id=$1 AND user_id=$2", [org, user])
      Be02Acceptance.check(rows.ntuples == 1, "authorization_generation_missing")
      value = Integer(rows.getvalue(0, 0), 10)
      Be02Acceptance.check(value.positive?, "authorization_generation_invalid")
      value
    end

    def scope_ids(scope) = [@seed.fetch("organizations").fetch(scope), @seed.fetch("mailboxes").fetch(scope)]
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    File.umask(0o077)
    Be02Acceptance::Fixture.new(Be02Acceptance::Runtime.new).run
    puts "acceptance_seed=ready actors=9"
  rescue Be02Acceptance::Failure => error
    # AIDEV-NOTE: Only our fixed assertion codes are safe to publish; library exceptions may contain secret values.
    warn "acceptance_seed=failed reason=#{error.message}; discard the task-owned fixture"
    exit 1
  rescue StandardError
    # AIDEV-NOTE: Keep PG/HTTP/parser exception text private because it may contain credentials or row data.
    warn "acceptance_seed=failed; discard the task-owned fixture and inspect with a private debugger"
    exit 1
  end
end
