# frozen_string_literal: true

require "cgi"
require_relative "acceptance_seed_support"
require_relative "acceptance_invitation_io"
require_relative "acceptance_invitation_transport"

module Be02Acceptance
  # AIDEV-NOTE: This fixture runs only after the original seed exits zero; Auth alone issues the invitation.
  class Invitation
    ORIGIN = "http://app.test"
    REDIRECT = "#{ORIGIN}/auth/complete"

    def initialize(directory = "/acceptance")
      Be02Acceptance.check(ENV.fetch("ELEVATEO_BROWSER_ORIGIN") == ORIGIN &&
        ENV.fetch("ELEVATEO_AUTH_URL") == "http://auth:9999" && ENV.fetch("ELEVATEO_MODE") == "local" &&
        ENV.fetch("ELEVATEO_OUTBOUND_HOLD") == "true", "invitation_environment_invalid")
      @output = InvitationOutput.new(directory)
      @seed = @output.read("seed.json")
      credentials = @output.read("acceptance-credentials.json")
      identity = object(@seed.fetch("fixture_identity"))
      Be02Acceptance.check(@seed["kind"] == "runtime" && credentials["schema_version"] == 1 &&
        object(credentials.fetch("passwords")).keys.sort == ACTORS.sort &&
        identity.fetch("dispatch_id") == ENV.fetch("BE02_ACCEPTANCE_DISPATCH_ID") &&
        identity.fetch("nonce") == ENV.fetch("BE02_ACCEPTANCE_NONCE"), "invitation_seed_not_ready")
      @organization = text(object(@seed.fetch("organizations")).fetch("primary"))
      @mailbox = text(object(@seed.fetch("mailboxes")).fetch("primary"))
      Be02Acceptance.check([@organization, @mailbox].all? { |id| id.is_a?(String) && UUID.match?(id) },
        "invitation_scope_invalid")
      actors = object(@seed.fetch("actors"))
      Be02Acceptance.check(actors.keys.sort == ACTORS.sort, "invitation_seed_actors_invalid")
      @actors = actors.values.map { |actor| text(object(actor).fetch("user_id")) }
      Be02Acceptance.check(@actors.length == ACTORS.length && @actors.uniq.length == ACTORS.length &&
        @actors.all? { |id| UUID.match?(id) }, "invitation_seed_actors_invalid")
      @delivery_deadline = nil
      @actor = ""
      @email = "acceptance-invite-#{SecureRandom.hex(16)}@example.invalid"
      @password = "Be02!#{SecureRandom.hex(24)}"
    end

    def database
      uri = URI.parse(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
      Be02Acceptance.check(%w[postgres postgresql].include?(uri.scheme) && uri.host == "db" &&
        uri.port == 5432 && uri.user == "supabase_admin" && uri.path == "/postgres" &&
        !uri.password.to_s.empty? && uri.query.nil? && uri.fragment.nil?, "invitation_database_invalid")
      db = PG.connect(host: "db", port: 5432, dbname: "postgres", user: "supabase_admin",
        password: URI::DEFAULT_PARSER.unescape(uri.password.to_s), connect_timeout: 3,
        options: "-c statement_timeout=10000 -c lock_timeout=5000 -c application_name=be02_acceptance_invitation")
      db.set_notice_processor { |_notice| nil }
      unless db.exec("SELECT session_user").getvalue(0, 0) == "supabase_admin"
        db.close
        raise Failure, "invitation_role_invalid"
      end
      db
    end

    def retire_previous(db)
      previous = @output.read(InvitationOutput::NAME)
      Be02Acceptance.check(previous.keys.sort == %w[actor_id link mailbox_id organization_id password version] &&
        previous["version"] == 1 && previous["organization_id"] == @organization && previous["mailbox_id"] == @mailbox &&
        previous["actor_id"].is_a?(String) && UUID.match?(text(previous.fetch("actor_id"))), "invitation_previous_invalid")
      actor = text(previous.fetch("actor_id"))
      Be02Acceptance.check(!@actors.include?(actor),
        "invitation_previous_is_seed_actor")
      db.transaction do
        db.exec_params("SELECT app_auth.lock_authorization_generations($1,$2)", [@organization, actor])
        scopes = db.exec_params("SELECT organization_id::text FROM app.organization_memberships WHERE user_id=$1", [actor])
        Be02Acceptance.check(scopes.column_values(0) == [@organization], "invitation_previous_scope_invalid")
        # AIDEV-NOTE: Retire prior lane access through real cascading triggers; disposable teardown owns Auth rows.
        db.exec_params("DELETE FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2", [@organization, actor])
      end
    rescue Errno::ENOENT
      # First lane has no prior private receipt.
    end

    def run
      db = database
      ids = @actors.sort
      actual = db.exec_params("SELECT id::text FROM auth.users WHERE id=ANY($1::uuid[]) ORDER BY id",
        ["{#{ids.join(',')}}"]).column_values(0)
      Be02Acceptance.check(ids.length == ACTORS.length && actual == ids, "invitation_seed_identities_missing")
      scope = db.exec_params("SELECT id FROM app.mailboxes WHERE id=$1 AND organization_id=$2", [@mailbox, @organization])
      Be02Acceptance.check(scope.ntuples == 1, "invitation_seed_scope_missing")
      retire_previous(db)
      @output.reset
      issue
      link = delivered_link
      token = self.class.validate_link(link)
      db.transaction do
        row = db.exec_params(<<~SQL, [@actor, @email, token])
          SELECT id FROM auth.users u WHERE id=$1 AND email=$2 AND confirmation_token=$3
            AND invited_at IS NOT NULL AND email_confirmed_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id)
            AND NOT EXISTS (SELECT 1 FROM app_auth.sessions s WHERE s.user_id=u.id) FOR UPDATE
        SQL
        Be02Acceptance.check(row.ntuples == 1, "invitation_auth_provenance_invalid")
        db.exec_params("SELECT app_auth.lock_authorization_generations($1,$2)", [@organization, @actor])
        db.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [@organization, @actor])
        db.exec_params("INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id) VALUES ($1,$2,$3)",
          [@organization, @mailbox, @actor])
      end
      @output.publish({ version: 1, link: link, password: @password, actor_id: @actor,
        organization_id: @organization, mailbox_id: @mailbox })
    ensure
      db&.close
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    File.umask(0o077)
    Be02Acceptance::Invitation.new.run
    puts "acceptance_invitation=ready"
  rescue StandardError
    # AIDEV-NOTE: Even parser/SQL assertion details remain private; never stringify link, password or provider errors.
    warn "acceptance_invitation=failed; discard the task-owned fixture"
    exit 1
  end
end
